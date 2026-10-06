// Bộ máy chạy trong trình duyệt (bản Artifact): đọc file → Claude (capability `sample`) soạn theo 2 phần
// → bộ kiểm tra quy tắc → Claude chấm → sửa theo phần bị lỗi → xuất Word.
// Dùng lại nguyên các module của bản máy chủ: validator, schema, prompts, render-docx, parse-input.
import mammoth from 'mammoth';
import { Packer } from 'docx';
import { KHBD_SCHEMA, GRADE_SCHEMA } from '../../src/lib/schema.js';
import { fillBySchema } from '../../src/lib/fill.js';
import { validateKHBD, tongHopDiem } from '../../src/lib/validator.js';
import { buildSystemPrompt, buildMetaBlock } from '../../src/lib/prompts.js';
import { htmlToText, splitLessons, preAudit, imageRefs } from '../../src/lib/parse-input.js';
import { buildKHBDDocument, buildReportDocument } from '../../src/lib/render-docx.js';
import kienThuc from '../../src/knowledge/kien-thuc-nen.md';
import quyTrinh from '../../src/knowledge/quy-trinh-tham-dinh.md';
import activeLearning from '../../src/knowledge/tieu-chi-active-learning.md';
import defaultConfig from '../../config/school.json';

const KB = { kienThuc, quyTrinh, activeLearning };
const MAX_BYTES = 250000;
const bytes = (s) => new TextEncoder().encode(s).length;

export function makeConfig(over = {}) {
  const c = structuredClone(defaultConfig);
  if (over.tieu_chi_trao_quyen?.length === 6) {
    c.tieu_chi_trao_quyen.danh_sach = over.tieu_chi_trao_quyen.map((ten, i) => ({ ma: `TQ-${'abcdef'[i]}`, ten }));
    c.tieu_chi_trao_quyen.da_xac_nhan = true;
  }
  if (over.diem_muc_tieu) c.diem_muc_tieu = over.diem_muc_tieu;
  if (over.so_vong !== undefined) c.so_vong_tu_sua_toi_da = over.so_vong;
  if (over.to_chuyen_mon) c.to_chuyen_mon_mac_dinh = over.to_chuyen_mon;
  return c;
}

// ───────── Đọc file ─────────
function imageSize(u8, type) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  try {
    if (type === 'png' && dv.getUint32(12) === 0x49484452) return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (type === 'gif') return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (type === 'jpg') {
      let i = 2;
      while (i < u8.length) {
        if (u8[i] !== 0xff) return null;
        const m = u8[i + 1];
        const len = dv.getUint16(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function readFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'json') {
    const raw = JSON.parse(await file.text());
    const list = Array.isArray(raw) ? raw : [raw];
    return { images: [], parts: list.map((k, i) => ({ so: i + 1, tieu_de: k?.meta?.ten_bai || `KHBD ${i + 1}`, text: '', khbd: k })) };
  }
  if (ext === 'txt' || ext === 'md') {
    const text = await file.text();
    return { images: [], parts: splitLessons(text) };
  }
  if (ext === 'docx') {
    const images = [];
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        convertImage: mammoth.images.imgElement(async (img) => {
          const type = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[img.contentType];
          if (!type) return { src: '' };
          const b64 = await img.read('base64');
          const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const size = imageSize(data, type);
          if (!size || size.width < 24 || size.height < 24) return { src: '' };
          images.push({ n: images.length + 1, type, data, ...size });
          return { src: '', alt: `[HÌNH ${images.length}]` };
        }),
      }
    );
    return { images, parts: splitLessons(htmlToText(value)) };
  }
  if (ext === 'doc') throw new Error('File .doc (Word 97–2003): hãy mở bằng Word và "Lưu thành" .docx rồi tải lại.');
  if (ext === 'pdf') throw new Error('Bản web này chưa đọc được PDF. Hãy mở PDF bằng Word và lưu thành .docx, hoặc dán nội dung vào file .txt.');
  throw new Error(`Định dạng .${ext} chưa hỗ trợ — dùng .docx hoặc .txt.`);
}

export { preAudit };

// ───────── Gọi Claude ─────────
const pick = (keys) => ({ ...KHBD_SCHEMA, properties: Object.fromEntries(keys.map((k) => [k, KHBD_SCHEMA.properties[k]])), required: keys });
const KEYS_A = ['meta', 'can_cu_chuong_trinh', 'muc_tieu', 'thiet_bi_hoc_lieu', 'ung_dung_ai', 'rubric', 'bo_cau_hoi_dinh_huong', 'dac_thu_phuong_phap'];
const KEYS_B = ['hoat_dong', 'du_kien_kho_khan', 'huong_dan_ve_nha', 'ghi_chu_thay_doi'];
const DAN_Y = {
  type: 'array',
  description: 'Dàn ý tiến trình để phần 2 bám theo: đủ hoạt động, mã HD1…, tổng phút = 45 × số tiết',
  items: { type: 'object', properties: { id: { type: 'string' }, ten: { type: 'string' }, loai: { type: 'string' }, buoc_4pp: { type: 'string' }, thoi_gian_phut: { type: 'integer' }, muc_tieu_ids: { type: 'array', items: { type: 'string' } } } },
};
const SCHEMA_A = (() => { const s = pick(KEYS_A); s.properties.dan_y_hoat_dong = DAN_Y; s.required = [...KEYS_A, 'dan_y_hoat_dong']; return s; })();
const SCHEMA_B = pick(KEYS_B);

const NO_WEB = 'Bản web này KHÔNG tra cứu được Internet. Dựa vào bản gốc của giáo viên và hiểu biết chắc chắn của bạn; mọi chi tiết SGK/yêu cầu cần đạt chưa chắc chắn PHẢI ghi vào can_cu_chuong_trinh.ghi_chu_can_kiem_tra ("GV kiểm tra lại theo SGK"), tuyệt đối không bịa số trang, đáp án, ngữ liệu.';

function fit(prompt, original) {
  // Giữ dưới giới hạn 256 KiB: cắt bớt phần bản gốc nếu cần (hiếm khi xảy ra với 1 tiết)
  let p = prompt.replace('{{BAN_GOC}}', original);
  if (bytes(p) <= MAX_BYTES) return p;
  const over = bytes(p) - MAX_BYTES + 2000;
  return prompt.replace('{{BAN_GOC}}', original.slice(0, Math.max(2000, original.length - over)) + '\n…(đã cắt bớt phần cuối do quá dài — hãy tách file theo từng tiết)');
}

async function ask(sample, prompt, { tier = 'complex', signal, onText, label }) {
  let n = 0;
  try {
    return await sample.json(prompt, {
      modelTier: tier,
      signal,
      cache: false,
      onText: ({ text }) => {
        n = text.length;
        onText?.(`${label}: đang viết… ${Math.round(n / 1000)}k ký tự`);
      },
    });
  } catch (e) {
    throw Object.assign(new Error(errMsg(e)), { code: e?.code });
  }
}

export function errMsg(e) {
  const m = {
    not_granted: 'Bạn chưa cho phép trang này dùng Claude. Tải lại trang và bấm Cho phép khi được hỏi.',
    sampling_disabled: 'Tài khoản/tổ chức của bạn chưa bật Claude cho Artifact.',
    rate_limited: 'Đã chạm giới hạn sử dụng Claude của tài khoản. Hãy thử lại sau ít phút.',
    prompt_too_large: 'Giáo án quá dài cho một lần xử lý. Hãy chọn ít tiết hơn hoặc tách file.',
    invalid_json: 'Claude trả kết quả bị cắt hoặc sai định dạng. Bấm chạy lại; nếu lặp lại, hãy chọn từng tiết một.',
    refused: 'Claude từ chối nội dung này. Kiểm tra lại nội dung file.',
    session_expired: 'Phiên đăng nhập đã hết hạn — hãy đăng nhập lại claude.ai.',
    cancelled: 'Đã dừng.',
    upstream_error: 'Lỗi kết nối tạm thời tới Claude. Bấm chạy lại.',
  };
  return m[e?.code] || e?.message || String(e);
}

export async function generate({ sample, config, opts, part, mode, signal, log }) {
  const sys = buildSystemPrompt(config, KB);
  const meta = buildMetaBlock(opts);
  const task = {
    nang_cap: 'NHIỆM VỤ: NÂNG CẤP bản KHBD gốc của giáo viên thành KHBD hoàn chỉnh đạt TOÀN BỘ danh mục bắt buộc (≥ 88/100, không lỗi P1/P2). Giữ ngữ liệu, bài tập, đáp án, ý đồ và ký hiệu [HÌNH n] của giáo viên.',
    soan_moi: 'NHIỆM VỤ: SOẠN MỚI KHBD hoàn chỉnh đạt TOÀN BỘ danh mục bắt buộc (≥ 88/100, không lỗi P1/P2).',
    trich_xuat: 'NHIỆM VỤ: TRÍCH XUẤT TRUNG THỰC bản KHBD gốc sang JSON để thẩm định. KHÔNG bổ sung, không sửa: phần bản gốc không có thì để rỗng/false/0; số phút đúng như bản gốc; ghi_chu_thay_doi rỗng.',
  }[mode];
  const goc = part.text ? `<ban_goc_cua_giao_vien>\n{{BAN_GOC}}\n</ban_goc_cua_giao_vien>` : '(Không có bản gốc — soạn mới.)';

  log('Phần 1/2: mục tiêu, thiết bị, rubric, câu hỏi định hướng, dàn ý tiến trình…');
  const pA = fit(`${sys}\n\n${task}\n${NO_WEB}\n\n<thong_tin_bai_hoc>\n${meta}\n</thong_tin_bai_hoc>\n\n${goc}\n\nĐây là PHẦN 1/2. Trả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau (gồm cả dan_y_hoat_dong — dàn ý tiến trình mà phần 2 sẽ viết chi tiết; mã hoạt động trong thiet_bi_hoc_lieu, rubric phải khớp dàn ý):\n${JSON.stringify(SCHEMA_A)}`, part.text);
  const a = await ask(sample, pA, { signal, onText: log, label: 'Phần 1/2' });

  log('Phần 2/2: tiến trình dạy học chi tiết…');
  const pB = fit(`${sys}\n\n${task}\n${NO_WEB}\n\n<thong_tin_bai_hoc>\n${meta}\n</thong_tin_bai_hoc>\n\n<phan_1_da_soan>\n${JSON.stringify(a)}\n</phan_1_da_soan>\n\n${goc}\n\nĐây là PHẦN 2/2. Viết chi tiết đúng các hoạt động trong dan_y_hoat_dong (giữ nguyên id, loai, buoc_4pp, thoi_gian_phut), dùng đúng các mã mục tiêu KT/NLC/NLDT/PC/TL/GT/TQ và rubric R.. ở phần 1 sao cho MỌI mục tiêu đều được ít nhất một hoạt động thực hiện. Trả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau:\n${JSON.stringify(SCHEMA_B)}`, part.text);
  const b = await ask(sample, pB, { signal, onText: log, label: 'Phần 2/2' });
  const { dan_y_hoat_dong: _, ...restA } = a || {};
  return fillBySchema({ ...restA, ...b }, KHBD_SCHEMA);
}

export async function grade({ sample, config, khbd, validation, signal, log }) {
  const sys = buildSystemPrompt(config, KB);
  const is4PP = khbd.meta.phuong_phap !== 'THUONG';
  const tc = is4PP
    ? 'Bước 6 (tiết 4PP): chấm TC1 (toi_da 10), TC3 (10), TC4 (12), TLIM (4), TQ (4). TC2 là CHỜ DỰ GIỜ — không đưa vào.'
    : 'Bước 6 (tiết thường, CV5555): chấm 1.1, 1.2, 1.3, 1.4, 2.1, 2.3 — toi_da 10, diem chỉ 10/7/4. Các tiêu chí chờ dự giờ không đưa vào.';
  const p = `${sys}\n\nNHIỆM VỤ: với vai trò chuyên viên thẩm định, chấm KHBD dưới đây theo rubric chính thức.\n- Bước 2/3 (tối đa 10): đối chiếu yêu cầu cần đạt (${is4PP ? 'tiết 4PP → nới lỏng' : 'tiết thường → chặt'}). Không tra cứu được web: chấm theo YCCĐ phổ biến của chủ đề.\n- ${tc}\n- Liệt kê lỗi chuyên môn mà bộ kiểm tra quy tắc không thấy: sai kiến thức, đáp án sai, nhiệm vụ không khả thi trong thời lượng, sản phẩm lệch mục tiêu.\n- Chỉ chấm điều nhìn thấy trên bản thiết kế; mỗi điểm trừ nêu căn cứ và cách lấy lại điểm.\n\n<ket_qua_bo_kiem_tra_quy_tac>\n${JSON.stringify({ diem: validation.diem, so_loi: validation.issues.length })}\n</ket_qua_bo_kiem_tra_quy_tac>\n\n<khbd>\n${JSON.stringify(khbd)}\n</khbd>\n\nTrả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau:\n${JSON.stringify(GRADE_SCHEMA)}`;
  log('Claude chấm chuyên môn (Bước 2/3, Bước 6)…');
  return fillBySchema(await ask(sample, p, { tier: 'default', signal, onText: log, label: 'Chấm' }), GRADE_SCHEMA);
}

export async function revise({ sample, config, opts, khbd, issues, gradeRes, signal, log }) {
  const sys = buildSystemPrompt(config, KB);
  const loi = issues.map((i, n) => `${n + 1}. [${i.muc_do}][${i.buoc}][${i.ma}] ${i.van_de} → ${i.de_xuat}`).join('\n');
  const ai = gradeRes
    ? [
        ...gradeRes.van_de_chuyen_mon.map((v) => `[${v.muc_do}] ${v.vi_tri}: ${v.van_de} → ${v.de_xuat_sua}`),
        ...(gradeRes.buoc_2_3.cach_lay_lai_diem ? [`Bước 2/3: ${gradeRes.buoc_2_3.cach_lay_lai_diem}`] : []),
        ...gradeRes.buoc_6.filter((x) => x.diem < x.toi_da).map((x) => `Bước 6 ${x.ma} (${x.diem}/${x.toi_da}): ${x.cach_lay_lai_diem}`),
      ].join('\n')
    : '';
  const p = `${sys}\n\nNHIỆM VỤ: SỬA KHBD (JSON) dưới đây để khắc phục TẤT CẢ lỗi liệt kê, giữ nguyên phần đã đạt.\n\n<thong_tin_bai_hoc>\n${buildMetaBlock(opts)}\n</thong_tin_bai_hoc>\n\n<loi_bo_kiem_tra_quy_tac>\n${loi || '(không có)'}\n</loi_bo_kiem_tra_quy_tac>\n\n<gop_y_cham_chuyen_mon>\n${ai || '(không có)'}\n</gop_y_cham_chuyen_mon>\n\n<khbd_hien_tai>\n${JSON.stringify(khbd)}\n</khbd_hien_tai>\n\nChỉ trả về các mục cấp cao nhất CẦN THAY ĐỔI, mỗi mục ở dạng HOÀN CHỈNH (vd sửa một hoạt động thì trả lại toàn bộ mảng hoat_dong). Định dạng: DUY NHẤT một đối tượng JSON {"cap_nhat": {<tên mục>: <giá trị mới>, ...}}; tên mục là một trong: ${Object.keys(KHBD_SCHEMA.properties).join(', ')}. Mỗi giá trị phải đúng schema của mục đó trong JSON Schema sau:\n${JSON.stringify(KHBD_SCHEMA)}`;
  const out = await ask(sample, p, { signal, onText: log, label: 'Tự sửa' });
  const patch = out?.cap_nhat && typeof out.cap_nhat === 'object' ? out.cap_nhat : {};
  const merged = { ...khbd };
  for (const [k, v] of Object.entries(patch)) if (k in KHBD_SCHEMA.properties) merged[k] = v;
  return fillBySchema(merged, KHBD_SCHEMA);
}

// Một tiết: soạn → (kiểm tra → chấm → sửa)* → kết quả
export async function runLesson({ sample, config, opts, part, mode, signal, log }) {
  const target = config.diem_muc_tieu;
  const ok = (s, v) => !s.co_p1 && s.diem_100 >= target && !v.issues.some((i) => i.muc_do === 'P1' || i.muc_do === 'P2');
  let khbd = part.khbd ? fillBySchema(part.khbd, KHBD_SCHEMA) : await generate({ sample, config, opts, part, mode, signal, log });
  const history = [];
  let v;
  let g = null;
  let s;
  const maxVong = mode === 'trich_xuat' || mode === 'tham_dinh' ? 0 : config.so_vong_tu_sua_toi_da;
  for (let vong = 0; ; vong++) {
    v = validateKHBD(khbd, { config });
    log(`Vòng ${vong} — bộ kiểm tra quy tắc: ${v.issues.filter((i) => i.muc_do === 'P1').length} P1, ${v.issues.filter((i) => i.muc_do === 'P2').length} P2, ${v.issues.filter((i) => i.muc_do === 'P3').length} P3.`, 'step');
    g = sample ? await grade({ sample, config, khbd, validation: v, signal, log }) : null;
    s = tongHopDiem(v, g);
    history.push({ vong, ...s, so_loi: v.issues.length });
    log(`Vòng ${vong} — ${s.diem_100}/100 · ${s.xep_loai} · ${s.ket_luan}`, ok(s, v) ? 'ok' : 'step');
    if (!sample || ok(s, v) || vong >= maxVong) break;
    log(`Tự sửa vòng ${vong + 1}…`, 'step');
    khbd = await revise({ sample, config, opts, khbd, issues: v.issues, gradeRes: g, signal, log });
  }
  return { part, pre: part.text ? preAudit(part.text, config.phut_moi_tiet * (opts.so_tiet || 1)) : null, research: null, khbd, validation: v, grade: g, score: s, history };
}

export async function toDocx(results, images, config, mode) {
  const files = {};
  const coKHBD = results.filter((r) => r.khbd);
  if (coKHBD.length && mode !== 'tham_dinh') {
    files['KHBD_hoan_chinh.docx'] = await Packer.toBlob(buildKHBDDocument(coKHBD.map((r) => r.khbd), config, { images, refs: coKHBD.map((r) => imageRefs(r.part.text)) }));
  }
  files['Bao_cao_tham_dinh.docx'] = await Packer.toBlob(buildReportDocument(results, { config, mode }));
  if (coKHBD.length) files['KHBD.json'] = new Blob([JSON.stringify(coKHBD.map((r) => r.khbd), null, 2)], { type: 'application/json' });
  return files;
}
