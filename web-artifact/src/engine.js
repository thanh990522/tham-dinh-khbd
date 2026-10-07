// Bộ máy trong trình duyệt: đọc giáo án → Claude (capability `sample`) nâng cấp theo 2 phần
// → bộ kiểm tra quy tắc + Claude chấm → sửa đúng phần lỗi → xuất KHBD hoàn chỉnh (.docx).
// Dùng lại các module của bản máy chủ: validator, schema, prompts, render-docx, parse-input.
import mammoth from 'mammoth';
import { Packer } from 'docx';
import { KHBD_SCHEMA, GRADE_SCHEMA } from '../../src/lib/schema.js';
import { fillBySchema } from '../../src/lib/fill.js';
import { validateKHBD, tongHopDiem } from '../../src/lib/validator.js';
import { buildSystemPrompt, buildMetaBlock } from '../../src/lib/prompts.js';
import { htmlToText, splitLessons, preAudit, imageRefs } from '../../src/lib/parse-input.js';
import { buildKHBDDocument } from '../../src/lib/render-docx.js';
import { renderKHBDHtml } from './render-html.js';
import kienThuc from '../../src/knowledge/kien-thuc-nen.md';
import quyTrinh from '../../src/knowledge/quy-trinh-tham-dinh.md';
import activeLearning from '../../src/knowledge/tieu-chi-active-learning.md';
import config from '../../config/school.json';

const KB = { kienThuc, quyTrinh, activeLearning };
const SYSTEM = buildSystemPrompt(config, KB);
const MAX_BYTES = 250000;
const bytes = (s) => new TextEncoder().encode(s).length;

export { preAudit };

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
  if (ext === 'txt') return { images: [], parts: splitLessons(await file.text()) };
  if (ext === 'docx') {
    const images = [];
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        convertImage: mammoth.images.imgElement(async (img) => {
          const type = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[img.contentType];
          if (!type) return { src: '' };
          const data = Uint8Array.from(atob(await img.read('base64')), (c) => c.charCodeAt(0));
          const size = imageSize(data, type);
          if (!size || size.width < 24 || size.height < 24) return { src: '' };
          images.push({ n: images.length + 1, type, data, ...size });
          return { src: '', alt: `[HÌNH ${images.length}]` };
        }),
      }
    );
    const parts = splitLessons(htmlToText(value));
    if (!parts.some((p) => p.text.trim().length > 50)) throw new Error('Không đọc được nội dung trong file này. Hãy kiểm tra file có chữ (không phải ảnh chụp).');
    return { images, parts };
  }
  if (ext === 'doc') throw new Error('File .doc (Word 97–2003): mở bằng Word, chọn "Lưu thành" .docx rồi tải lại.');
  if (ext === 'pdf') throw new Error('Chưa đọc được PDF: mở PDF bằng Word, lưu thành .docx rồi tải lại.');
  throw new Error(`Chưa hỗ trợ file .${ext} — hãy dùng .docx.`);
}

// ───────── Gọi Claude ─────────
const pick = (keys) => ({ ...KHBD_SCHEMA, properties: Object.fromEntries(keys.map((k) => [k, KHBD_SCHEMA.properties[k]])), required: keys });
const KEYS_A = ['meta', 'can_cu_chuong_trinh', 'muc_tieu', 'thiet_bi_hoc_lieu', 'ung_dung_ai', 'rubric', 'bo_cau_hoi_dinh_huong', 'dac_thu_phuong_phap'];
const KEYS_B = ['hoat_dong', 'du_kien_kho_khan', 'huong_dan_ve_nha', 'ghi_chu_thay_doi'];
const SCHEMA_A = (() => {
  const s = pick(KEYS_A);
  s.properties.dan_y_hoat_dong = {
    type: 'array',
    description: 'Dàn ý tiến trình để phần 2 bám theo: đủ hoạt động, mã HD1…, tổng phút = 45 × số tiết',
    items: { type: 'object', properties: { id: { type: 'string' }, ten: { type: 'string' }, loai: { type: 'string' }, buoc_4pp: { type: 'string' }, thoi_gian_phut: { type: 'integer' }, muc_tieu_ids: { type: 'array', items: { type: 'string' } } } },
  };
  s.required = [...KEYS_A, 'dan_y_hoat_dong'];
  return s;
})();
const SCHEMA_B = pick(KEYS_B);

const TASK = 'NHIỆM VỤ: NÂNG CẤP bản KHBD gốc của giáo viên thành KHBD hoàn chỉnh đạt TOÀN BỘ danh mục bắt buộc (≥ 88/100, không lỗi P1/P2). Giữ ngữ liệu, bài tập, đáp án, ý đồ và ký hiệu [HÌNH n] của giáo viên.';
const NO_WEB = 'Không tra cứu được Internet: dựa vào bản gốc và hiểu biết chắc chắn của bạn; chi tiết SGK/yêu cầu cần đạt chưa chắc chắn PHẢI ghi vào can_cu_chuong_trinh.ghi_chu_can_kiem_tra ("GV kiểm tra lại theo SGK"), không bịa số trang, đáp án, ngữ liệu.';

function withOriginal(prompt, original) {
  const p = prompt.replace('{{BAN_GOC}}', () => original);
  if (bytes(p) <= MAX_BYTES) return p;
  const cut = original.slice(0, Math.max(2000, original.length - (bytes(p) - MAX_BYTES) - 2000));
  return prompt.replace('{{BAN_GOC}}', () => `${cut}\n…(phần cuối quá dài đã được lược bớt)`);
}

export function errMsg(e) {
  const m = {
    not_granted: 'Trang chưa được phép dùng Claude. Tải lại trang và chọn Cho phép khi được hỏi.',
    sampling_disabled: 'Tài khoản hoặc tổ chức của bạn chưa bật Claude cho trang này.',
    rate_limited: 'Đã chạm giới hạn sử dụng Claude của tài khoản. Thử lại sau ít phút.',
    prompt_too_large: 'Tiết này quá dài cho một lần xử lý. Hãy tách file theo từng tiết.',
    invalid_json: 'Kết quả từ Claude bị cắt giữa chừng. Bấm nâng cấp lại.',
    refused: 'Claude từ chối nội dung này. Kiểm tra lại nội dung file.',
    session_expired: 'Phiên đăng nhập claude.ai đã hết hạn — hãy đăng nhập lại.',
    upstream_error: 'Mất kết nối tạm thời tới Claude. Bấm nâng cấp lại.',
  };
  return m[e?.code] || e?.message || 'Đã có lỗi không xác định.';
}

async function ask(sample, prompt, { tier = 'complex', signal, onChars }) {
  try {
    return await sample.json(prompt, { modelTier: tier, signal, cache: false, onText: ({ text }) => onChars?.(text.length) });
  } catch (e) {
    throw Object.assign(new Error(errMsg(e)), { code: e?.code });
  }
}

async function generate({ sample, opts, part, signal, stage }) {
  const meta = buildMetaBlock(opts);
  const head = `${SYSTEM}\n\n${TASK}\n${NO_WEB}\n\n<thong_tin_bai_hoc>\n${meta}\n</thong_tin_bai_hoc>`;
  const goc = '<ban_goc_cua_giao_vien>\n{{BAN_GOC}}\n</ban_goc_cua_giao_vien>';

  stage('soan1');
  const a = await ask(sample, withOriginal(`${head}\n\n${goc}\n\nĐây là PHẦN 1/2. Trả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau (gồm dan_y_hoat_dong — dàn ý tiến trình mà phần 2 sẽ viết chi tiết; mã hoạt động trong thiet_bi_hoc_lieu và rubric phải khớp dàn ý):\n${JSON.stringify(SCHEMA_A)}`, part.text), { signal, onChars: (n) => stage('soan1', n) });

  stage('soan2');
  const b = await ask(sample, withOriginal(`${head}\n\n<phan_1_da_soan>\n${JSON.stringify(a)}\n</phan_1_da_soan>\n\n${goc}\n\nĐây là PHẦN 2/2. Viết chi tiết đúng các hoạt động trong dan_y_hoat_dong (giữ nguyên id, loai, buoc_4pp, thoi_gian_phut), dùng đúng các mã mục tiêu KT/NLC/NLDT/PC/TL/GT/TQ và rubric R.. của phần 1 sao cho MỌI mục tiêu đều có ít nhất một hoạt động thực hiện. Trả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau:\n${JSON.stringify(SCHEMA_B)}`, part.text), { signal, onChars: (n) => stage('soan2', n) });

  const { dan_y_hoat_dong: _, ...restA } = a || {};
  return fillBySchema({ ...restA, ...b }, KHBD_SCHEMA);
}

async function grade({ sample, khbd, validation, signal, stage }) {
  const is4PP = khbd.meta.phuong_phap !== 'THUONG';
  const tc = is4PP
    ? 'Bước 6 (tiết 4PP): chấm TC1 (toi_da 10), TC3 (10), TC4 (12), TLIM (4), TQ (4). TC2 là CHỜ DỰ GIỜ — không đưa vào.'
    : 'Bước 6 (tiết thường, CV5555): chấm 1.1, 1.2, 1.3, 1.4, 2.1, 2.3 — toi_da 10, diem chỉ 10/7/4. Tiêu chí chờ dự giờ không đưa vào.';
  const p = `${SYSTEM}\n\nNHIỆM VỤ: với vai trò chuyên viên thẩm định, chấm KHBD dưới đây theo rubric chính thức.\n- Bước 2/3 (tối đa 10): đối chiếu yêu cầu cần đạt (${is4PP ? 'tiết 4PP → nới lỏng' : 'tiết thường → chặt'}); không tra cứu được web nên chấm theo YCCĐ phổ biến của chủ đề.\n- ${tc}\n- Liệt kê lỗi chuyên môn mà bộ kiểm tra quy tắc không thấy: sai kiến thức, đáp án sai, nhiệm vụ không khả thi trong thời lượng, sản phẩm lệch mục tiêu.\n- Chỉ chấm điều nhìn thấy trên bản thiết kế; mỗi điểm trừ nêu căn cứ và cách lấy lại điểm.\n\n<ket_qua_bo_kiem_tra_quy_tac>\n${JSON.stringify({ diem: validation.diem, so_loi: validation.issues.length })}\n</ket_qua_bo_kiem_tra_quy_tac>\n\n<khbd>\n${JSON.stringify(khbd)}\n</khbd>\n\nTrả về DUY NHẤT một đối tượng JSON đúng JSON Schema sau:\n${JSON.stringify(GRADE_SCHEMA)}`;
  stage('cham');
  return fillBySchema(await ask(sample, p, { tier: 'default', signal, onChars: (n) => stage('cham', n) }), GRADE_SCHEMA);
}

async function revise({ sample, opts, khbd, issues, g, signal, stage }) {
  const loi = issues.map((i, n) => `${n + 1}. [${i.muc_do}][${i.buoc}][${i.ma}] ${i.van_de} → ${i.de_xuat}`).join('\n');
  const gop = g
    ? [
        ...g.van_de_chuyen_mon.map((v) => `[${v.muc_do}] ${v.vi_tri}: ${v.van_de} → ${v.de_xuat_sua}`),
        ...(g.buoc_2_3.cach_lay_lai_diem ? [`Bước 2/3: ${g.buoc_2_3.cach_lay_lai_diem}`] : []),
        ...g.buoc_6.filter((x) => x.diem < x.toi_da).map((x) => `Bước 6 ${x.ma} (${x.diem}/${x.toi_da}): ${x.cach_lay_lai_diem}`),
      ].join('\n')
    : '';
  const p = `${SYSTEM}\n\nNHIỆM VỤ: SỬA KHBD (JSON) dưới đây để khắc phục TẤT CẢ lỗi liệt kê, giữ nguyên phần đã đạt.\n\n<thong_tin_bai_hoc>\n${buildMetaBlock(opts)}\n</thong_tin_bai_hoc>\n\n<loi_bo_kiem_tra_quy_tac>\n${loi || '(không có)'}\n</loi_bo_kiem_tra_quy_tac>\n\n<gop_y_cham_chuyen_mon>\n${gop || '(không có)'}\n</gop_y_cham_chuyen_mon>\n\n<khbd_hien_tai>\n${JSON.stringify(khbd)}\n</khbd_hien_tai>\n\nChỉ trả về các mục cấp cao nhất CẦN THAY ĐỔI, mỗi mục ở dạng HOÀN CHỈNH (sửa một hoạt động thì trả lại toàn bộ mảng hoat_dong). Định dạng: DUY NHẤT một đối tượng JSON {"cap_nhat": {<tên mục>: <giá trị mới>, ...}}; tên mục thuộc: ${Object.keys(KHBD_SCHEMA.properties).join(', ')}. Mỗi giá trị đúng schema của mục đó trong JSON Schema sau:\n${JSON.stringify(KHBD_SCHEMA)}`;
  stage('sua');
  const out = await ask(sample, p, { signal, onChars: (n) => stage('sua', n) });
  const patch = out?.cap_nhat && typeof out.cap_nhat === 'object' ? out.cap_nhat : {};
  const merged = { ...khbd };
  for (const [k, v] of Object.entries(patch)) if (k in KHBD_SCHEMA.properties) merged[k] = v;
  return fillBySchema(merged, KHBD_SCHEMA);
}

// Một tiết: nâng cấp → (kiểm tra → chấm → sửa)* đến khi đạt hoặc hết số vòng
export async function upgradeLesson({ sample, opts, part, signal, stage }) {
  const target = config.diem_muc_tieu;
  const passed = (s, v) => !s.co_p1 && s.diem_100 >= target && !v.issues.some((i) => i.muc_do === 'P1' || i.muc_do === 'P2');
  let khbd = await generate({ sample, opts, part, signal, stage });
  const history = [];
  let v;
  let s;
  for (let vong = 0; ; vong++) {
    v = validateKHBD(khbd, { config });
    const g = await grade({ sample, khbd, validation: v, signal, stage });
    s = tongHopDiem(v, g);
    history.push(s.diem_100);
    if (passed(s, v) || vong >= config.so_vong_tu_sua_toi_da) break;
    khbd = await revise({ sample, opts, khbd, issues: v.issues, g, signal, stage });
  }
  return { part, khbd, score: s, validation: v, history };
}

export async function buildDocx(results, images) {
  const doc = buildKHBDDocument(results.map((r) => r.khbd), config, { images, refs: results.map((r) => imageRefs(r.part.text)) });
  return Packer.toBlob(doc);
}

export function buildHtml(results, images) {
  return renderKHBDHtml(results.map((r) => r.khbd), config, { images, refs: results.map((r) => imageRefs(r.part.text)) });
}
