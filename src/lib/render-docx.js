// Xuất file Word: (1) KHBD hoàn chỉnh theo khung CV5512 / khung 4PP Việt Anh; (2) Báo cáo thẩm định.
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, PageBreak, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType, VerticalAlign, PageOrientation, ImageRun, LineRuleType,
} from 'docx';
import { PHUONG_PHAP, TEN_LOAI_HOAT_DONG, TEN_BUOC_4PP, THOI_QUEN, GIA_TRI } from './schema.js';

const FONT = 'Times New Roman';
const CONTENT_W = 9355; // A4, lề trái 3cm, phải 1.5cm (twip)
const LAND_W = 14400; // A4 ngang cho bảng 3 cột

// ───────── helpers ─────────
// Ảnh từ giáo án gốc: ký hiệu [HÌNH n] trong văn bản được thay bằng ảnh thật khi xuất.
let IMAGES = new Map();
const MAX_IMG_W = 160; // px
const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || 26, bold: o.bold, italics: o.italics, color: o.color });
function imageRun(n) {
  const img = IMAGES.get(n);
  if (!img) return run(`(hình ${n} trong giáo án gốc)`, { italics: true, size: 22 });
  const scale = Math.min(1, MAX_IMG_W / img.width);
  return new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } });
}
// Văn bản có thể chứa [HÌNH n] → chuỗi TextRun/ImageRun
function rich(text, o = {}) {
  const parts = String(text ?? '').split(/\[HÌNH (\d+)\]/);
  return parts.flatMap((t, i) => (i % 2 ? [imageRun(Number(t))] : t ? [run(t, o)] : []));
}
function para(content, o = {}) {
  const runs = Array.isArray(content) ? content : rich(content, o);
  return new Paragraph({
    children: runs,
    alignment: o.align,
    spacing: { before: o.before ?? 40, after: o.after ?? 60, line: 300, lineRule: LineRuleType.AUTO },
    indent: o.indent ? { left: o.indent } : undefined,
    heading: o.heading,
    keepNext: o.keepNext,
  });
}
const h = (text, level = 1) =>
  para([run(text, { bold: true, size: level === 0 ? 32 : level === 1 ? 28 : 26 })], { before: level <= 1 ? 200 : 120, after: 80, keepNext: true, align: level === 0 ? AlignmentType.CENTER : undefined });
const label = (lb, text, o = {}) => para([run(lb, { bold: true, size: o.size }), ...rich(text, { size: o.size })], o);
const bullet = (text, o = {}) => para([run('– ', { size: o.size }), ...(Array.isArray(text) ? text : rich(text, { size: o.size }))], { indent: o.indent ?? 284, ...o });
const lines = (text, o = {}) => String(text || '').split('\n').filter((l) => l.trim()).map((l) => para(l, o));

function cell(children, o = {}) {
  const kids = (Array.isArray(children) ? children : [children]).flat().map((c) => (typeof c === 'string' ? para(c, { size: o.size || 24 }) : c));
  return new TableCell({
    children: kids.length ? kids : [para('')],
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    columnSpan: o.span,
    verticalAlign: o.vAlign || VerticalAlign.TOP,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}
function table(rows, widths, o = {}) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: o.noBorder
      ? { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }
      : { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((r, i) =>
      new TableRow({
        tableHeader: i === 0 && o.header !== false,
        children: r.map((c, j) => (c instanceof TableCell ? c : cell(c, { w: widths[j], fill: i === 0 && o.header !== false ? 'D9E2F3' : undefined, size: o.size }))),
      })
    ),
  });
}
const headerRow = (cols) => cols.map((c) => para([run(c, { bold: true, size: 24 })], { align: AlignmentType.CENTER }));
const sp = () => para('', { before: 0, after: 0 });

function tenPP(k) {
  return PHUONG_PHAP[k.meta.phuong_phap] || k.meta.phuong_phap;
}

// ───────── KHBD ─────────
function biaKHBD(k, config) {
  const m = k.meta;
  return [
    table(
      [[
        [para([run((m.truong || config.truong).toUpperCase(), { bold: true })], { align: AlignmentType.CENTER }), para(m.to_chuyen_mon ? `TỔ: ${m.to_chuyen_mon.toUpperCase()}` : 'TỔ CHUYÊN MÔN: ……………', { align: AlignmentType.CENTER }), para([run(config.khau_hieu, { italics: true, size: 22 })], { align: AlignmentType.CENTER })],
        [para([run(`Môn: ${m.mon_hoc} – Lớp ${m.lop}`, { bold: true })], { align: AlignmentType.CENTER }), para(`Tiết PPCT: ${m.tiet_ppct || '……'}   ·   Tuần: ${m.tuan || '……'}`, { align: AlignmentType.CENTER }), para(`Giáo viên: ${m.giao_vien || '……………………'}`, { align: AlignmentType.CENTER })],
      ]],
      [CONTENT_W / 2, CONTENT_W / 2],
      { noBorder: true, header: false }
    ),
    para([run('KẾ HOẠCH BÀI DẠY', { bold: true, size: 32 })], { align: AlignmentType.CENTER, before: 240 }),
    para([run(m.ten_bai, { bold: true, size: 28 })], { align: AlignmentType.CENTER }),
    para(`Số tiết: ${m.so_tiet} · Bộ sách: ${m.bo_sach || 'Kết nối tri thức với cuộc sống'}`, { align: AlignmentType.CENTER }),
    para([run('Phương pháp: ', { bold: true }), run(tenPP(k))], { align: AlignmentType.CENTER }),
    para([run(m.su_dung_ai ? 'Có sử dụng AI (xem mục Ứng dụng AI)' : 'Không sử dụng AI', { bold: true, italics: true })], { align: AlignmentType.CENTER, after: 200 }),
  ];
}

function mucTieuKHBD(k) {
  const mt = k.muc_tieu;
  const is4PP = k.meta.phuong_phap !== 'THUONG';
  const items = (arr) => arr.map((x) => bullet([run(`[${x.id}] `, { bold: true }), run(x.noi_dung)]));
  const out = [h('I. MỤC TIÊU'), h('1. Về kiến thức', 2), ...items(mt.kien_thuc), h('2. Về năng lực', 2), para([run('a) Năng lực chung:', { italics: true, bold: true })]), ...items(mt.nang_luc_chung), para([run('b) Năng lực đặc thù:', { italics: true, bold: true })]), ...items(mt.nang_luc_dac_thu), h('3. Về phẩm chất', 2), ...items(mt.pham_chat)];
  const tlim = mt.tlim.map((t) => bullet([run(`[${t.id}] Thói quen ${t.thoi_quen_so} – ${t.ten_thoi_quen || THOI_QUEN[t.thoi_quen_so]}: `, { bold: true }), run(`công cụ ${t.cong_cu}. Hành vi quan sát: ${t.hanh_vi_quan_sat}`)]));
  const gt = mt.gia_tri_cot_loi.map((g) => bullet([run(`[${g.id}] Giá trị ${g.gia_tri_so} – ${g.ten_gia_tri || GIA_TRI[g.gia_tri_so]} (cấp ${g.cap_bac}): `, { bold: true }), run(g.hanh_vi_quan_sat)]));
  if (is4PP || tlim.length || gt.length) {
    out.push(h(is4PP ? '4. TLIM (The Leader in Me) & Giá trị cốt lõi' : '4. Lồng ghép TLIM & Giá trị cốt lõi Việt Anh', 2), ...tlim, ...gt);
  }
  if (is4PP || mt.trao_quyen.length) {
    out.push(h(is4PP ? '5. Trao quyền (Empowerment)' : '5. Trao quyền cho học sinh', 2), ...mt.trao_quyen.map((t) => bullet([run(`[${t.id}] `, { bold: true }), run(t.noi_dung), run(t.tieu_chi_dap_ung.length ? ` (đáp ứng: ${t.tieu_chi_dap_ung.join(', ')})` : '', { italics: true })])));
  }
  return out;
}

function thietBiKHBD(k) {
  return [
    h('II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU'),
    table([headerRow(['Thiết bị / học liệu', 'Người dùng', 'Dùng ở hoạt động']), ...k.thiet_bi_hoc_lieu.map((t) => [t.ten, t.doi_tuong, t.dung_cho_hoat_dong.join(', ')])], [5600, 1300, 2455]),
  ];
}

function aiKHBD(k) {
  const a = k.ung_dung_ai;
  if (!k.meta.su_dung_ai) return [h('Ứng dụng AI', 2), para([run('Không sử dụng AI trong tiết học này.', { italics: true })])];
  const out = [h('Ứng dụng AI', 2)];
  if (a.giao_vien.length) out.push(table([headerRow(['Khâu (phía GV)', 'Công cụ', 'Cách kiểm chứng']), ...a.giao_vien.map((g) => [g.khau, g.cong_cu, g.cach_kiem_chung])], [3400, 2000, 3955]));
  out.push(label('Học sinh được dùng AI: ', a.hoc_sinh_duoc_dung ? 'Có' : 'Không'));
  if (a.hoc_sinh_duoc_dung) {
    out.push(label('Nhiệm vụ được dùng: ', a.nhiem_vu_hs_duoc_dung.join('; ')), label('Giới hạn: ', a.gioi_han), label('Khâu bắt buộc tự làm: ', a.khau_bat_buoc_tu_lam.join('; ')), label('Lưu dấu vết: ', a.luu_dau_vet));
  }
  out.push(label('Đánh giá phân biệt tư duy HS với phần AI: ', a.danh_gia_phan_biet));
  return out;
}

function dacThuKHBD(k) {
  const d = k.dac_thu_phuong_phap;
  const pp = k.meta.phuong_phap;
  const out = [];
  if (pp === 'CT') {
    const p = d.praad;
    out.push(h('Quy trình PRAAD (Critical Thinking)', 2),
      table([headerRow(['Bước', 'Nội dung thiết kế']),
        ['P – Mục đích', `${p.muc_dich_loai.replace(/_/g, ' ')}: ${p.muc_dich}`],
        ['R – Tiêu chí', p.tieu_chi.map((x) => `• ${x}`).join('\n')],
        ['A – Giả định', p.gia_dinh.map((x) => `• ${x}`).join('\n')],
        ['A – Phân tích', [...p.khia_canh.map((x) => `• Khía cạnh: ${x}`), ...p.gia_thuyet_minh_chung.map((x) => `• ${x}`), `• Độ tin cậy nguồn: ${p.do_tin_cay_nguon}`].join('\n')],
        ['D – Quyết định', p.quyet_dinh],
      ].map((r, i) => (i === 0 ? r : [r[0], lines(r[1], { size: 24 })])), [2000, 7355]));
  }
  if (pp === 'LA') {
    out.push(h('Các cấp độ LikeAbility (chia sẻ mục tiêu với HS ngay đầu bài)', 2));
    for (const c of d.cap_do_likeability) {
      out.push(label(`${c.ten} (Bloom: ${c.muc_bloom}) — `, `Mục tiêu: ${c.muc_tieu}`), ...c.nhiem_vu.map((n, i) => bullet(`Nhiệm vụ ${i + 1}: ${n.hoi} → Lời giải: ${n.goi_y_dap_an}`)), para([run('Ngưỡng lên cấp: ', { italics: true, bold: true }), run(c.nguong_len_cap, { italics: true })], { indent: 284 }));
    }
  }
  if (pp === 'CA') {
    out.push(h('Chủ đề CrossAbility', 2));
    for (const c of d.chu_de_crossability) {
      out.push(label('Chủ đề: ', c.ten), para([run('Câu hỏi dẫn dắt:', { italics: true })]), ...c.cau_hoi_dan_dat.map((q) => bullet(q)), para([run('Câu hỏi chéo cho nhóm khác:', { italics: true })]), ...c.cau_hoi_cheo.map((q) => bullet(`${q.hoi} → ${q.goi_y_dap_an}`)));
    }
  }
  if (pp === 'SD') {
    out.push(h('Phương án Same / Different', 2), label('Hình thức tổ chức: ', d.hinh_thuc_same_different),
      table([headerRow(['Phương án', 'Định hướng thực hiện', 'Tài liệu tham khảo']), ...d.phuong_an_same_different.map((x) => [x.ten, x.dinh_huong, x.tai_lieu])], [2200, 4655, 2500]),
      label('Yêu cầu so sánh giống/khác: ', d.yeu_cau_so_sanh));
  }
  return out;
}

function cauHoiKHBD(k) {
  const b = k.bo_cau_hoi_dinh_huong;
  const out = [h('BỘ CÂU HỎI ĐỊNH HƯỚNG'), ...(b.mo_ta ? [para([run(b.mo_ta, { italics: true })])] : [])];
  for (const n of b.nhom) {
    out.push(para([run(n.ten_nhom, { bold: true })], { keepNext: true }));
    n.cau_hoi.forEach((q, i) => out.push(bullet([run(`${i + 1}. ${q.hoi}`), ...(q.goi_y_dap_an ? [run(` → Gợi ý: ${q.goi_y_dap_an}`, { italics: true })] : [])])));
  }
  return out;
}

function rubricKHBD(k) {
  const out = [h('RUBRIC ĐÁNH GIÁ (công bố cho học sinh đầu tiết)')];
  for (const r of k.rubric) {
    out.push(para([run(`[${r.id}] ${r.ten}`, { bold: true }), run(` — áp dụng: ${r.ap_dung_cho.join(', ')}; ${r.thoi_diem_cong_bo}`, { italics: true })], { keepNext: true }));
    out.push(table([headerRow(['Tiêu chí', 'Tốt', 'Đạt', 'Chưa đạt']), ...r.tieu_chi.map((t) => [`${t.ten}${t.lien_ket_muc_tieu.length ? ` (${t.lien_ket_muc_tieu.join(', ')})` : ''}`, t.tot, t.dat, t.chua_dat])], [2155, 2400, 2400, 2400]), sp());
  }
  return out;
}

const HINH_THUC = { ca_nhan: 'Cá nhân', cap_doi: 'Cặp đôi', nhom: 'Nhóm', ca_lop: 'Cả lớp' };

function chiTietToChuc(a, size = 24) {
  const t = a.to_chuc;
  const out = [
    label('Bước 1 – Chuyển giao nhiệm vụ: ', t.giao_nhiem_vu, { size }),
    label('Bước 2 – Thực hiện nhiệm vụ: ', t.thuc_hien_nhiem_vu, { size }),
    label('Bước 3 – Báo cáo, thảo luận: ', t.bao_cao_thao_luan, { size }),
    label('Bước 4 – Kết luận, nhận định: ', t.ket_luan_nhan_dinh, { size }),
  ];
  if (a.phan_vai.length) out.push(label('Phân vai: ', a.phan_vai.map((v) => `${v.vai} – ${v.nhiem_vu}`).join('; '), { size }));
  if (a.kiem_tra_hieu_bai.co) out.push(label('Kiểm tra mức hiểu: ', `${a.kiem_tra_hieu_bai.cong_cu}. Điều chỉnh: ${a.kiem_tra_hieu_bai.cach_dieu_chinh}`, { size }));
  if (a.ho_tro_hs) out.push(label('Hỗ trợ HS gặp khó: ', a.ho_tro_hs, { size }));
  if (a.dung_ai) out.push(label('Dùng AI: ', a.dung_ai, { size }));
  if (a.cau_hoi_chiem_nghiem.length) {
    out.push(para([run('Câu hỏi chiêm nghiệm:', { bold: true, size })]));
    a.cau_hoi_chiem_nghiem.forEach((q) => out.push(bullet(`${q.hoi}${q.cham_vao_ids.length ? ` (${q.cham_vao_ids.join(', ')})` : ''}`, { size })));
  }
  return out;
}

const lienKet = (a) => [...a.muc_tieu_ids, ...a.tlim_ids, ...a.gia_tri_ids, ...a.trao_quyen_ids].filter((x, i, arr) => arr.indexOf(x) === i).join(', ');

function tienTrinh4PP(k) {
  const rows = [headerRow(['CÁC HOẠT ĐỘNG', 'NỘI DUNG – SẢN PHẨM', 'MỤC TIÊU (+ Thời gian)'])];
  for (const a of k.hoat_dong) {
    rows.push([
      [para([run(`${a.id}. ${a.ten}`, { bold: true, size: 24 })]), para([run(`${TEN_BUOC_4PP[a.buoc_4pp]} · ${HINH_THUC[a.hinh_thuc]}`, { italics: true, size: 22 })]), ...chiTietToChuc(a)],
      [label('Nội dung: ', a.noi_dung, { size: 24 }), label('Sản phẩm: ', a.san_pham, { size: 24 }), ...(a.rubric_ids.length ? [label('Đánh giá: ', `rubric ${a.rubric_ids.join(', ')}`, { size: 24 })] : [])],
      [para(a.muc_tieu_hoat_dong, { size: 24 }), para([run(`Mục tiêu: ${lienKet(a)}`, { italics: true, size: 22 })]), para([run(`⏱ ${a.thoi_gian_phut} phút`, { bold: true, size: 24 })])],
    ]);
  }
  return [h('III. TIẾN TRÌNH DẠY HỌC'), table(rows, [6400, 4600, 3400])];
}

function tienTrinhThuong(k) {
  const out = [h('III. TIẾN TRÌNH DẠY HỌC')];
  k.hoat_dong.forEach((a, i) => {
    out.push(h(`Hoạt động ${i + 1}: ${a.ten} — ${TEN_LOAI_HOAT_DONG[a.loai]} (${a.thoi_gian_phut} phút)`, 2));
    out.push(label('a) Mục tiêu: ', `${a.muc_tieu_hoat_dong} (${lienKet(a)})`));
    out.push(label('b) Nội dung: ', a.noi_dung));
    out.push(label('c) Sản phẩm: ', a.san_pham + (a.rubric_ids.length ? ` — đánh giá theo rubric ${a.rubric_ids.join(', ')}` : '')));
    out.push(para([run('d) Tổ chức thực hiện ', { bold: true }), run(`(${HINH_THUC[a.hinh_thuc]})`, { italics: true })]));
    out.push(...chiTietToChuc(a, 26).map((p) => p));
  });
  return out;
}

function cuoiKHBD(k) {
  const out = [];
  if (k.du_kien_kho_khan.length) out.push(h('IV. DỰ KIẾN KHÓ KHĂN VÀ GIẢI PHÁP'), table([headerRow(['Khó khăn dự kiến', 'Giải pháp']), ...k.du_kien_kho_khan.map((x) => [x.kho_khan, x.giai_phap])], [4300, 5055]));
  if (k.huong_dan_ve_nha) out.push(h('V. HƯỚNG DẪN TỰ HỌC Ở NHÀ'), ...lines(k.huong_dan_ve_nha));
  const cc = k.can_cu_chuong_trinh;
  out.push(h('PHỤ LỤC – CĂN CỨ CHƯƠNG TRÌNH'), para([run('Yêu cầu cần đạt (GDPT 2018):', { bold: true })]), ...cc.yeu_cau_can_dat.map((y) => bullet(y)));
  if (cc.noi_dung_sgk_tom_tat) out.push(label('Nội dung SGK: ', cc.noi_dung_sgk_tom_tat));
  if (cc.nguon_tham_khao.length) out.push(para([run('Nguồn tra cứu:', { bold: true })]), ...cc.nguon_tham_khao.map((n) => bullet(n, { size: 22 })));
  if (cc.ghi_chu_can_kiem_tra.length) out.push(para([run('⚠ Giáo viên cần kiểm tra lại theo SGK:', { bold: true, color: 'C00000' })]), ...cc.ghi_chu_can_kiem_tra.map((n) => bullet([run(n, { color: 'C00000' })])));
  return out;
}

function phuLucHinh(k, refs) {
  const daDung = new Set([...JSON.stringify(k).matchAll(/\[HÌNH (\d+)\]/g)].map((m) => Number(m[1])));
  const conLai = (refs || []).filter((n) => !daDung.has(n) && IMAGES.has(n));
  if (!conLai.length) return [];
  return [h('PHỤ LỤC – HÌNH ẢNH TỪ GIÁO ÁN GỐC'), para([run('Các hình dưới đây có trong giáo án gốc nhưng chưa được gắn vào hoạt động cụ thể — GV chọn vị trí sử dụng.', { italics: true, size: 22 })]), ...conLai.map((n) => para([run(`Hình ${n}: `, { bold: true }), imageRun(n)]))];
}

export function khbdSections(k, config, refs) {
  const is4PP = k.meta.phuong_phap !== 'THUONG';
  const portrait = [...biaKHBD(k, config), ...mucTieuKHBD(k), ...thietBiKHBD(k), ...aiKHBD(k), ...dacThuKHBD(k), ...cauHoiKHBD(k), ...rubricKHBD(k), ...(is4PP ? [] : tienTrinhThuong(k)), ...(is4PP ? [] : [...cuoiKHBD(k), ...phuLucHinh(k, refs)])];
  const sections = [{ properties: pagePortrait(), children: portrait }];
  if (is4PP) {
    sections.push({ properties: pageLandscape(), children: tienTrinh4PP(k) });
    sections.push({ properties: pagePortrait(), children: [...cuoiKHBD(k), ...phuLucHinh(k, refs)] });
  }
  return sections;
}

const pagePortrait = () => ({ page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } });
const pageLandscape = () => ({ page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } });

const docStyles = { default: { document: { run: { font: FONT, size: 26 } } } };

// images: [{n, type, data, width, height}] của file gốc; refs[i]: các số hình thuộc tiết thứ i
export async function renderKHBDDocx(list, config, { images = [], refs = [] } = {}) {
  IMAGES = new Map(images.map((im) => [im.n, im]));
  const sections = list.flatMap((k, i) => khbdSections(k, config, refs[i]));
  const doc = new Document({ creator: config.truong, title: list.map((k) => k.meta.ten_bai).join(' | '), styles: docStyles, sections });
  return Packer.toBuffer(doc);
}

// ───────── BÁO CÁO THẨM ĐỊNH ─────────
function giaiTrinh(r) {
  const s = r.score;
  const v = r.validation;
  const g = r.grade;
  const rows = [headerRow(['Thành phần', 'Tối đa', 'Đạt', 'Mức', 'Căn cứ / vì sao mất điểm / cách lấy lại'])];
  rows.push(['Bước 1 – Đúng khung mẫu', '15', String(s.buoc1), v.diem.buoc1.muc, v.diem.buoc1.thieu.length ? `Thiếu: ${v.diem.buoc1.thieu.join('; ')} → bổ sung để lấy lại ${15 - s.buoc1}đ.` : 'Đủ thành phần khung mẫu.']);
  rows.push(['Bước 2/3 – Yêu cầu cần đạt', '10', s.buoc23 === null ? '—' : String(s.buoc23), g ? g.buoc_2_3.muc : 'Cần AI chấm', g ? `${g.buoc_2_3.can_cu}${g.buoc_2_3.cach_lay_lai_diem ? ` → ${g.buoc_2_3.cach_lay_lai_diem}` : ''}` : 'Chưa chấm (chưa có AI).']);
  rows.push(['Bước 4 – Thời gian', '—', '—', 'Chỉ cảnh báo', v.diem.buoc4.canh_bao.length ? v.diem.buoc4.canh_bao.join(' ') : `Tổng ${v.diem.buoc4.tong_phut} phút, khớp số tiết.`]);
  rows.push(['Bước 5 – Nhất quán mục tiêu ↔ hoạt động', '20', String(s.buoc5), v.diem.buoc5.muc, [v.diem.buoc5.bo_roi.length ? `Mục tiêu bị bỏ rơi: ${v.diem.buoc5.bo_roi.join(', ')}` : '', v.diem.buoc5.lac.length ? `Hoạt động lạc: ${v.diem.buoc5.lac.join(', ')}` : ''].filter(Boolean).join('. ') || 'Mọi mục tiêu đều có hoạt động thực hiện; không có hoạt động lạc.']);
  rows.push(['Bước 6 – Tiêu chí chuyên môn', '40', s.buoc6 ? String(s.buoc6.diem) : '—', s.buoc6 ? levelText(s.buoc6.diem / 40) : 'Cần AI chấm', s.buoc6 ? 'Xem bảng chi tiết Bước 6 bên dưới (đã loại phần chờ dự giờ khỏi mẫu số).' : 'Chưa chấm (chưa có AI).']);
  const b7 = v.diem.buoc7;
  const b7txt = [
    `Active Learning ${b7.d1.diem}/5 (HS hoạt động ${b7.d1.ti_le_hs}%)${b7.d1.thieu.length ? ' — thiếu ' + b7.d1.thieu.join('; ') : ''}`,
    `5GT&7TQ ${b7.d2.diem}/5${b7.d2.thieu.length ? ' — thiếu ' + b7.d2.thieu.join('; ') : ''}`,
    b7.d3.khong_ap_dung ? 'Ứng dụng AI: KHÔNG ÁP DỤNG (không dùng AI) — loại khỏi mẫu số, 15đ chia lại cho 2 tiêu chí.' : `Ứng dụng AI ${b7.d3.diem}/5${b7.d3.thieu.length ? ' — thiếu ' + b7.d3.thieu.join('; ') : ''}`,
  ].join('\n');
  rows.push(['Bước 7 – Ba tiêu chí đặc thù Việt Anh', '15', String(b7.diem), b7.muc, lines(b7txt, { size: 22 })]);
  rows.push([para([run('TỔNG', { bold: true })]), String(s.kha_tham_dinh), para([run(String(s.diem_tho), { bold: true })]), s.xep_loai, s.day_du ? `Điểm /100: ${s.diem_100}` : `Mới chấm phần quy tắc (${s.kha_tham_dinh}đ khả thẩm định) → quy đổi ${s.diem_100}/100 (tham khảo)`]);
  return table(rows, [2300, 700, 700, 1200, 4455]);
}

function levelText(p) {
  return p >= 0.85 ? 'Tốt' : p >= 0.7 ? 'Đạt' : p >= 0.5 ? 'Cần cải thiện' : 'Chưa đạt';
}

function preAuditBlock(pre) {
  if (!pre) return [];
  return [
    h('Rà soát sơ bộ BẢN GỐC (tự động theo từ khoá, chỉ để tham khảo)', 2),
    table([headerRow(['Thành phần', 'Bước', 'Bản gốc']), ...pre.items.map((i) => [i.ten, i.buoc, i.co ? 'Có' : i.p1 ? 'KHÔNG CÓ (P1)' : 'Không thấy'])], [5555, 1300, 2500]),
    para(`Các mốc thời gian đọc được: ${pre.thoi_gian.cac_moc.join(' + ') || '—'} = ${pre.thoi_gian.tong} phút (chuẩn ${pre.thoi_gian.chuan} phút) → ${pre.thoi_gian.khop ? 'khớp' : 'KHÔNG KHỚP'}.`, { size: 24 }),
  ];
}

function reportForResult(r, i, total, { config, mode }) {
  const out = [];
  const title = r.khbd ? r.khbd.meta.ten_bai : r.part.tieu_de;
  out.push(h(`${total > 1 ? `${i + 1}. ` : ''}${title}`, 1));
  if (!r.khbd) {
    out.push(para([run('Chưa có khoá API Claude nên hệ thống chỉ rà soát sơ bộ bản gốc. Cấu hình ANTHROPIC_API_KEY để soạn/nâng cấp và chấm đầy đủ.', { italics: true, color: 'C00000' })]));
    out.push(...preAuditBlock(r.pre));
    return out;
  }
  const s = r.score;
  const v = r.validation;
  out.push(label('Đối tượng: ', mode === 'tham_dinh' ? 'KHBD gốc của giáo viên (cấu trúc hoá trung thực, không chỉnh sửa)' : 'KHBD hoàn chỉnh do hệ thống nâng cấp/soạn'));
  out.push(label('Phương pháp: ', tenPP(r.khbd)));
  out.push(para([run('KẾT QUẢ: ', { bold: true }), run(`${s.diem_100}/100 · ${s.xep_loai} · `, { bold: true }), run(s.ket_luan, { bold: true, color: s.co_p1 || s.diem_100 < 70 ? 'C00000' : '2E7D32' })]));
  if (!s.day_du) out.push(para([run('Lưu ý: chưa có phần chấm AI (Bước 2/3, Bước 6) — điểm trên chỉ là quy đổi từ phần chấm theo quy tắc.', { italics: true })]));
  out.push(giaiTrinh(r));

  if (r.grade) {
    out.push(h('Chi tiết Bước 6 – Tiêu chí chuyên môn', 2));
    out.push(table([headerRow(['Tiêu chí', 'Điểm', 'Mức', 'Căn cứ', 'Cách lấy lại điểm']), ...s.buoc6.chi_tiet.map((x) => [`${x.ma} – ${x.ten}`, `${x.diem}/${x.toi_da}`, x.muc, x.can_cu, x.cach_lay_lai_diem || '—'])], [2000, 800, 1100, 3255, 2200]));
    out.push(para([run(r.khbd.meta.phuong_phap === 'THUONG' ? 'Đã loại khỏi mẫu số các tiêu chí CHỜ DỰ GIỜ: 2.2, 2.4, 3.1, 3.2, 3.3, 3.4.' : 'TC2 (mức độ HS thực hiện nhiệm vụ – Bloom): CHƯA ĐÁNH GIÁ (chờ dự giờ), loại khỏi mẫu số.', { italics: true, size: 22 })]));
  }

  out.push(h('Ma trận mục tiêu ↔ hoạt động (Bước 5)', 2));
  out.push(table([headerRow(['Mã', 'Mục tiêu', 'Hoạt động thực hiện']), ...v.ma_tran.map((m) => [m.id, m.noi_dung, m.hoat_dong.length ? m.hoat_dong.join(', ') : 'KHÔNG CÓ (P1)'])], [900, 6055, 2400]));
  out.push(para(`Thời lượng: ${v.thong_ke.tong_phut} phút; HS trực tiếp hoạt động ${v.thong_ke.phut_hs} phút (${v.thong_ke.ti_le_hs}%).`, { size: 24 }));

  if (r.grade) {
    out.push(h('PLUS – điểm mạnh', 2), ...r.grade.plus.map((x) => bullet(x)));
    out.push(h('DELTA – cần cải thiện', 2), ...r.grade.delta.map((x) => bullet(x)));
    if (r.grade.hoat_dong_hay) out.push(label('Hoạt động/nội dung hay: ', r.grade.hoat_dong_hay));
  }

  const viec = [...v.issues.map((x) => ({ muc_do: x.muc_do, txt: `[${x.buoc} · ${x.ma}] ${x.van_de} → ${x.de_xuat}` })), ...(r.grade?.van_de_chuyen_mon || []).map((x) => ({ muc_do: x.muc_do, txt: `[Chuyên môn · ${x.vi_tri}] ${x.van_de} → ${x.de_xuat_sua}` }))].sort((a, b) => a.muc_do.localeCompare(b.muc_do));
  out.push(h('VIỆC CẦN SỬA TRƯỚC KHI DẠY', 2));
  if (!viec.length) out.push(para('Không còn lỗi P1/P2/P3 nào được phát hiện.'));
  viec.forEach((x, n) => out.push(para([run(`${n + 1}. [${x.muc_do}] `, { bold: true, color: x.muc_do === 'P1' ? 'C00000' : undefined }), run(x.txt)], { indent: 284 })));

  if (r.history.length > 1) {
    out.push(h('Tiến trình tự kiểm tra – tự sửa', 2), table([headerRow(['Vòng', 'Điểm /100', 'Xếp loại', 'Số vấn đề (quy tắc)', 'Kết luận']), ...r.history.map((x) => [String(x.vong), String(x.diem_100), x.xep_loai, String(x.so_loi), x.ket_luan])], [900, 1300, 1600, 1800, 3755]));
  }
  if (r.khbd.ghi_chu_thay_doi.length) out.push(h('Nhật ký nâng cấp so với bản gốc', 2), ...r.khbd.ghi_chu_thay_doi.map((x) => bullet(x)));
  if (r.khbd.can_cu_chuong_trinh.ghi_chu_can_kiem_tra.length) out.push(h('Điểm GV cần kiểm tra lại theo SGK', 2), ...r.khbd.can_cu_chuong_trinh.ghi_chu_can_kiem_tra.map((x) => bullet([run(x, { color: 'C00000' })])));
  out.push(...preAuditBlock(r.pre));
  return out;
}

export async function renderReportDocx(results, { config, mode }) {
  const children = [
    para([run(config.truong.toUpperCase(), { bold: true })], { align: AlignmentType.CENTER }),
    para([run('BÁO CÁO THẨM ĐỊNH KẾ HOẠCH BÀI DẠY', { bold: true, size: 32 })], { align: AlignmentType.CENTER, before: 120 }),
    para([run(`Năm học ${config.nam_hoc} · Bảng điểm chính thức /100 · Quy trình 7 bước · Mã lỗi P1/P2/P3`, { italics: true, size: 22 })], { align: AlignmentType.CENTER, after: 200 }),
    para([run('Quy tắc: có ≥1 lỗi P1 → bắt buộc nộp lại bản v2, bất kể điểm. Xếp loại: Tốt 85–100 · Đạt 70–84 · Cần cải thiện 50–69 · Chưa đạt <50. Từ 88 điểm và không có P1 → xét Ngân hàng KHBD mẫu.', { size: 22 })]),
    para([run(config.tieu_chi_trao_quyen.da_xac_nhan ? '6 tiêu chí Trao quyền: theo danh sách chính thức của nhà trường.' : 'Ghi chú: 6 tiêu chí Trao quyền dùng để chấm là danh sách TẠM do tài liệu nguồn chưa liệt kê — TTCM cập nhật ở mục Cài đặt trên web.', { italics: true, size: 20 })]),
  ];
  results.forEach((r, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...reportForResult(r, i, results.length, { config, mode }));
  });
  children.push(para([run(`Người chấm: Hệ thống hỗ trợ (AI + bộ kiểm tra quy tắc) — TTCM xác nhận: ……………………   Ngày: ${new Date().toLocaleDateString('vi-VN')}`, { italics: true, size: 22 })], { before: 300 }));
  const doc = new Document({ creator: config.truong, title: 'Báo cáo thẩm định KHBD', styles: docStyles, sections: [{ properties: pagePortrait(), children }] });
  return Packer.toBuffer(doc);
}
