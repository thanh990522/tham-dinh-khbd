// Bộ kiểm tra theo QUY TẮC (không dùng AI) cho KHBD có cấu trúc.
// Chấm các thành phần kiểm được một cách khách quan trên bản thiết kế:
//   Bước 1 (khung mẫu, 15đ) · Bước 4 (thời gian, chỉ cảnh báo) · Bước 5 (nhất quán mục tiêu, 20đ)
//   Bước 7 (Active Learning · 5GT&7TQ · Ứng dụng AI, 15đ) · phần cấu trúc của Bước 6.
// Bước 2/3 (yêu cầu cần đạt) và chất lượng chuyên môn của Bước 6 cần AI chấm (xem ai.js).
// Căn cứ: references/quy-trinh-tham-dinh.md (bảng điểm chính thức năm học 2026–2027).

import { THOI_QUEN, GIA_TRI } from './schema.js';

const blank = (s) => !s || !String(s).trim();
const VERB_HS = /(\bHS\b|học sinh|\bSs\b|students?|pairs?|groups?|nhóm|cặp|mỗi em|từng em|cá nhân)/i;
const GV_ONLY = /(GV|giáo viên|teacher)\s+(giảng|thuyết trình|trình bày|explains?|presents?|lectures?)[^.]*?(HS|học sinh|Ss|students)\s+(nghe|ghi chép|chép|listen|take notes)/i;

function levelFromPct(pct) {
  if (pct >= 0.85) return 'Tốt';
  if (pct >= 0.7) return 'Đạt';
  if (pct >= 0.5) return 'Cần cải thiện';
  return 'Chưa đạt';
}

function d7Score(missing) {
  // 5 = đủ 4 dấu hiệu; 4 = thiếu 1; 3 = thiếu 2; 1–2 = thiếu ≥3; 0 = không đề cập
  return [5, 4, 3, 2, 1][Math.min(missing.length, 4)];
}

export function validateKHBD(k, opts = {}) {
  const config = opts.config || {};
  const phutTiet = config.phut_moi_tiet || 45;
  const tqDanhSach = config.tieu_chi_trao_quyen?.danh_sach?.map((x) => x.ma) || [];
  const issues = [];
  const add = (muc_do, buoc, ma, van_de, de_xuat) => issues.push({ muc_do, buoc, ma, van_de, de_xuat });

  const is4PP = k.meta.phuong_phap !== 'THUONG';
  const hd = k.hoat_dong || [];
  const mt = k.muc_tieu;
  const loai = (l) => hd.filter((a) => a.loai === l);
  const hdIds = new Set(hd.map((a) => a.id));

  // ───────────────────────── BƯỚC 1 — KHUNG MẪU ─────────────────────────
  const b1Missing = []; // {ten, chinh: bool}
  const need = (cond, ten, chinh, muc_do, ma, de_xuat) => {
    if (!cond) {
      b1Missing.push({ ten, chinh });
      add(muc_do, 'Bước 1', ma, `Thiếu: ${ten}`, de_xuat);
    }
  };
  need(mt.kien_thuc.length > 0, 'Mục tiêu kiến thức', true, 'P2', 'KM-KT', 'Bổ sung mục I.1 Về kiến thức.');
  need(mt.nang_luc_chung.length > 0, 'Năng lực chung', true, 'P2', 'KM-NLC', 'Bổ sung năng lực chung (tự chủ – tự học, giao tiếp – hợp tác, GQVĐ – sáng tạo).');
  need(mt.nang_luc_dac_thu.length > 0, 'Năng lực đặc thù môn học', true, 'P2', 'KM-NLDT', 'Bổ sung năng lực đặc thù của môn.');
  need(mt.pham_chat.length > 0, 'Mục tiêu phẩm chất', true, 'P2', 'KM-PC', 'Bổ sung mục I.3 Về phẩm chất.');
  if (is4PP) {
    need(mt.tlim.length > 0, 'Mục tiêu TLIM (phần 4)', true, 'P2', 'KM-TLIM', 'Nêu rõ tên thói quen (1 trong 7) + công cụ lãnh đạo HS vận dụng.');
    need(mt.trao_quyen.length > 0, 'Mục tiêu Trao quyền (phần 5)', true, 'P2', 'KM-TQ', 'Nêu hoạt động GV trao quyền cho HS.');
  }
  need(k.thiet_bi_hoc_lieu.length > 0, 'Thiết bị dạy học và học liệu', true, 'P2', 'KM-TB', 'Liệt kê thiết bị/học liệu gắn với từng hoạt động.');
  need(loai('chiem_nghiem').length > 0, 'Hoạt động Chiêm nghiệm', true, 'P1', 'KM-CN', 'Thêm hoạt động Chiêm nghiệm cuối bài (GV và HS phản tư: khó khăn, cách khắc phục, điều học được).');
  need(loai('cung_co').length > 0, 'Hoạt động Củng cố', false, 'P2', 'KM-CC', 'Thêm hoạt động Củng cố sau Chiêm nghiệm.');
  const soCauHoi = k.bo_cau_hoi_dinh_huong.nhom.reduce((s, n) => s + n.cau_hoi.length, 0);
  need(soCauHoi > 0, 'Bộ câu hỏi định hướng', true, is4PP ? 'P1' : 'P2', 'KM-CHDH', 'Xây bộ câu hỏi định hướng theo khung của phương pháp (kèm gợi ý đáp án).');
  need(k.rubric.length > 0 && k.rubric.every((r) => r.tieu_chi.length > 0), 'Rubric đánh giá sản phẩm HS', false, 'P2', 'KM-RB', 'Thêm rubric (Tốt/Đạt/Chưa đạt) cho sản phẩm chính, công bố đầu tiết.');
  if (k.rubric.length > 0 && !k.rubric.some((r) => /đầu tiết|đầu giờ|khi giao nhiệm vụ|beginning|start/i.test(r.thoi_diem_cong_bo))) {
    add('P3', 'Bước 1', 'KM-RB2', 'Rubric chưa ghi rõ công bố cho HS ngay đầu tiết.', 'Ghi "Công bố cho HS đầu tiết" tại rubric và ở bước giao nhiệm vụ.');
  }
  if (!is4PP) {
    for (const l of ['khoi_dong', 'hinh_thanh_kien_thuc', 'luyen_tap', 'van_dung']) {
      if (loai(l).length === 0 && !(l === 'khoi_dong' && loai('xac_dinh_nhiem_vu').length)) {
        need(false, `Hoạt động ${l.replace(/_/g, ' ')} (CV5512)`, true, 'P2', 'KM-HD', 'Tiến trình CV5512 cần đủ 4 hoạt động: Mở đầu → Hình thành kiến thức → Luyện tập → Vận dụng.');
      }
    }
  }
  for (const a of hd) {
    const t = a.to_chuc;
    const thieu = [];
    if (blank(a.muc_tieu_hoat_dong)) thieu.push('a) Mục tiêu');
    if (blank(a.noi_dung)) thieu.push('b) Nội dung');
    if (blank(a.san_pham)) thieu.push('c) Sản phẩm');
    if ([t.giao_nhiem_vu, t.thuc_hien_nhiem_vu, t.bao_cao_thao_luan, t.ket_luan_nhan_dinh].some(blank)) thieu.push('d) Tổ chức thực hiện đủ 4 bước');
    if (thieu.length) add('P2', 'Bước 1', 'KM-4MUC', `${a.id} "${a.ten}" thiếu: ${thieu.join(', ')}.`, 'Mỗi hoạt động cần đủ a) Mục tiêu · b) Nội dung · c) Sản phẩm · d) Tổ chức thực hiện (4 bước).');
    if (!blank(a.san_pham) && a.san_pham.trim().length < 25) {
      add('P2', 'Bước 1', 'KM-SP', `${a.id}: sản phẩm mô tả chung chung ("${a.san_pham.trim()}").`, 'Mô tả sản phẩm cụ thể, chấm được (nội dung, hình thức, đáp án/tiêu chí).');
    }
  }

  // Yêu cầu đặc thù từng phương pháp (thuộc khung mẫu + TC4)
  const dt = k.dac_thu_phuong_phap;
  const tc4Missing = [];
  const pp = k.meta.phuong_phap;
  if (pp === 'LA') {
    const lv = dt.cap_do_likeability;
    if (lv.length < 3) {
      tc4Missing.push('≥3 cấp độ');
      add('P1', 'Bước 1', 'PP-LA3', `LikeAbility mới có ${lv.length} cấp độ.`, 'Thiết kế tối thiểu 3 cấp độ (Cơ bản → Khá → Giỏi) theo thang Bloom.');
    }
    if (lv.some((c) => blank(c.muc_tieu))) tc4Missing.push('mục tiêu riêng mỗi cấp');
    if (lv.some((c) => c.nhiem_vu.length === 0 || c.nhiem_vu.some((n) => blank(n.goi_y_dap_an)))) tc4Missing.push('nhiệm vụ + lời giải đầy đủ mỗi cấp');
    if (lv.some((c) => blank(c.nguong_len_cap))) tc4Missing.push('ngưỡng hoàn thành để lên cấp');
  } else if (pp === 'CA') {
    const cd = dt.chu_de_crossability;
    if (cd.length < 2) tc4Missing.push('2–3 chủ đề độc lập');
    if (cd.some((c) => c.cau_hoi_dan_dat.length === 0)) {
      tc4Missing.push('câu hỏi dẫn dắt cho từng chủ đề');
      add('P1', 'Bước 1', 'PP-CA-CH', 'Có chủ đề CrossAbility chưa có hệ thống câu hỏi dẫn dắt.', 'Mỗi chủ đề cần hệ thống câu hỏi dẫn dắt riêng.');
    }
    if (cd.some((c) => c.cau_hoi_cheo.length < 2 || c.cau_hoi_cheo.some((q) => blank(q.goi_y_dap_an)))) tc4Missing.push('≥2 câu hỏi chéo kèm đáp án mỗi nhóm');
    const loaiRb = new Set(k.rubric.map((r) => r.loai));
    if (!loaiRb.has('trinh_bay') || !loaiRb.has('tiep_nhan')) tc4Missing.push('2 rubric (nhóm trình bày + nhóm nghe)');
  } else if (pp === 'CT') {
    const p = dt.praad;
    if (blank(p.muc_dich_loai) || blank(p.muc_dich)) tc4Missing.push('P – mục đích');
    if (p.tieu_chi.length === 0) tc4Missing.push('R – tiêu chí');
    if (p.gia_dinh.length === 0) tc4Missing.push('A – giả định');
    if (p.khia_canh.length === 0 || p.gia_thuyet_minh_chung.length === 0 || blank(p.do_tin_cay_nguon)) tc4Missing.push('A – phân tích (khía cạnh, giả thuyết–minh chứng, độ tin cậy nguồn)');
    if (blank(p.quyet_dinh)) tc4Missing.push('D – quyết định');
  } else if (pp === 'SD') {
    if (dt.phuong_an_same_different.length < 2) tc4Missing.push('≥2 phương án/giải pháp');
    if (dt.phuong_an_same_different.some((x) => blank(x.dinh_huong))) tc4Missing.push('định hướng cho từng phương án');
    if (blank(dt.yeu_cau_so_sanh)) tc4Missing.push('yêu cầu so sánh giống/khác');
    if (blank(dt.hinh_thuc_same_different)) tc4Missing.push('hình thức tổ chức (1 trong 3)');
  }
  if (tc4Missing.length) {
    b1Missing.push({ ten: `Yếu tố đặc thù ${pp}: ${tc4Missing.join('; ')}`, chinh: false });
    add('P2', 'Bước 1', 'PP-DT', `Thiếu yếu tố đặc thù phương pháp: ${tc4Missing.join('; ')}.`, 'Bổ sung đúng yêu cầu đặc thù của phương pháp (xem khung mẫu).');
  }

  const chinhThieu = b1Missing.filter((m) => m.chinh).length;
  // Thang rubric: Tốt 13–15 đủ hết · Đạt 11–12 thiếu 1 thành phần phụ · Cần cải thiện 8–10 thiếu 2–3
  // hoặc thiếu hẳn bộ câu hỏi định hướng · Chưa đạt 0–7 thiếu nhiều thành phần cốt lõi.
  const nThieu = b1Missing.length;
  let b1;
  if (nThieu === 0) b1 = 15;
  else if (nThieu === 1 && chinhThieu === 0) b1 = 12;
  else if (nThieu <= 3) b1 = soCauHoi === 0 ? 8 : 11 - nThieu; // 10, 9, 8
  else b1 = Math.max(0, 7 - (nThieu - 4));

  // ───────────────────────── BƯỚC 4 — THỜI GIAN (chỉ cảnh báo) ─────────────────────────
  const tong = hd.reduce((s, a) => s + (a.thoi_gian_phut || 0), 0);
  const chuan = phutTiet * (k.meta.so_tiet || 1);
  const canhBaoThoiGian = [];
  if (tong !== chuan) {
    canhBaoThoiGian.push(`Tổng thời gian ${tong} phút ≠ ${chuan} phút (${k.meta.so_tiet} tiết).`);
    add('P2', 'Bước 4', 'TG-TONG', `Tổng thời gian các hoạt động ${tong} phút, không khớp ${chuan} phút.`, 'Phân bổ lại để tổng đúng số tiết.');
  }
  for (const a of hd) {
    if (!a.thoi_gian_phut || a.thoi_gian_phut <= 0) canhBaoThoiGian.push(`${a.id} chưa ghi số phút.`);
  }
  for (const a of [...loai('chiem_nghiem'), ...loai('cung_co')]) {
    if (a.thoi_gian_phut < 3) canhBaoThoiGian.push(`${a.id} (${a.loai}) chỉ ${a.thoi_gian_phut} phút — bị dồn, nên ≥3 phút.`);
  }

  // ───────────────────────── BƯỚC 5 — NHẤT QUÁN MỤC TIÊU ↔ HOẠT ĐỘNG ─────────────────────────
  const allMT = [
    ...mt.kien_thuc, ...mt.nang_luc_chung, ...mt.nang_luc_dac_thu, ...mt.pham_chat, ...(mt.active_learning || []),
  ].map((m) => ({ id: m.id, noi_dung: m.noi_dung }));
  const tlimIds = mt.tlim.map((t) => t.id);
  const gtIds = mt.gia_tri_cot_loi.map((g) => g.id);
  const tqIds = mt.trao_quyen.map((t) => t.id);
  const phuBoi = (id) => hd.filter((a) => a.muc_tieu_ids.includes(id) || a.tlim_ids.includes(id) || a.gia_tri_ids.includes(id) || a.trao_quyen_ids.includes(id)).map((a) => a.id);
  const maTran = [
    ...allMT.map((m) => ({ ...m, hoat_dong: phuBoi(m.id) })),
    ...mt.tlim.map((t) => ({ id: t.id, noi_dung: `Thói quen ${t.thoi_quen_so} – ${t.ten_thoi_quen} (${t.cong_cu})`, hoat_dong: phuBoi(t.id) })),
    ...mt.gia_tri_cot_loi.map((g) => ({ id: g.id, noi_dung: `Giá trị ${g.gia_tri_so} – ${g.ten_gia_tri}`, hoat_dong: phuBoi(g.id) })),
    ...mt.trao_quyen.map((t) => ({ id: t.id, noi_dung: t.noi_dung, hoat_dong: phuBoi(t.id) })),
  ];
  const boRoi = maTran.filter((m) => m.hoat_dong.length === 0);
  for (const m of boRoi) {
    add('P1', 'Bước 5', 'NQ-BORoi', `Mục tiêu ${m.id} "${m.noi_dung}" không có hoạt động nào thực hiện.`, `Gắn ${m.id} vào ít nhất một hoạt động có nhiệm vụ cụ thể thực hiện mục tiêu đó, hoặc bỏ mục tiêu khỏi phần I.`);
  }
  const allIds = new Set([...allMT.map((m) => m.id), ...tlimIds, ...gtIds, ...tqIds]);
  const lac = hd.filter((a) => !['chiem_nghiem', 'cung_co'].includes(a.loai) && a.muc_tieu_ids.filter((x) => allIds.has(x)).length === 0);
  for (const a of lac) {
    add('P2', 'Bước 5', 'NQ-LAC', `${a.id} "${a.ten}" không gắn với mục tiêu chung nào (hoạt động lạc).`, 'Ghi rõ mục tiêu chung mà hoạt động phục vụ, hoặc lược bỏ hoạt động.');
  }
  const idLa = hd.flatMap((a) => [...a.muc_tieu_ids, ...a.tlim_ids, ...a.gia_tri_ids, ...a.trao_quyen_ids].filter((x) => !allIds.has(x)).map((x) => `${a.id}→${x}`));
  if (idLa.length) add('P3', 'Bước 5', 'NQ-ID', `Mã mục tiêu không tồn tại: ${idLa.join(', ')}.`, 'Sửa mã cho khớp phần I.');
  const moNhat = maTran.filter((m) => m.hoat_dong.length === 1 && /^(KT|NLDT)/.test(m.id) && hd.find((a) => a.id === m.hoat_dong[0])?.loai === 'cung_co');
  let b5;
  if (boRoi.length === 0 && lac.length === 0) b5 = moNhat.length ? 16 : 20;
  else if (boRoi.length + lac.length === 1) b5 = 12;
  else b5 = Math.max(0, 9 - (boRoi.length + lac.length - 2) * 2);

  // ───────────────────────── BƯỚC 7 — BA TIÊU CHÍ ĐẶC THÙ ─────────────────────────
  // D.1 Active Learning
  const phutHS = hd.reduce((s, a) => s + Math.max(0, (a.thoi_gian_phut || 0) - (a.phut_gv_thuyet_giang || 0)), 0);
  const tiLeHS = tong ? phutHS / tong : 0;
  const d1Missing = [];
  if (tiLeHS < 0.5 || hd.some((a) => !a.thoi_gian_phut)) d1Missing.push('DH1: HS hoạt động ≥50% thời lượng, mỗi hoạt động ghi số phút');
  const giangDai = hd.filter((a) => a.phut_gv_thuyet_giang > 10);
  const khongDongTuHS = hd.filter((a) => !VERB_HS.test(a.to_chuc.thuc_hien_nhiem_vu) || GV_ONLY.test(a.noi_dung + ' ' + a.to_chuc.thuc_hien_nhiem_vu));
  if (giangDai.length || khongDongTuHS.length) d1Missing.push('DH2: mô tả bằng động từ hành động của HS; mỗi lượt GV giảng ≤10 phút');
  const nhomCoVai = hd.filter((a) => ['cap_doi', 'nhom'].includes(a.hinh_thuc) && a.phan_vai.length >= 2 && a.phan_vai.every((v) => !blank(v.nhiem_vu)));
  if (nhomCoVai.length === 0) d1Missing.push('DH3: ≥1 hoạt động cặp/nhóm có phân vai rõ từng thành viên');
  const cuoi = new Set(['chiem_nghiem', 'cung_co']);
  const viTriCuoi = hd.length - 1;
  const kiemTraGiua = hd.filter((a, i) => a.kiem_tra_hieu_bai.co && !blank(a.kiem_tra_hieu_bai.cong_cu) && !cuoi.has(a.loai) && i < viTriCuoi - 1);
  if (kiemTraGiua.length === 0) d1Missing.push('DH4: ≥1 điểm kiểm tra mức hiểu giữa bài (câu hỏi nhanh, thẻ thoát, bảng trắng...)');
  const d1 = d7Score(d1Missing);
  if (!(mt.active_learning || []).length) add('P2', 'Bước 7', 'AL-MT', 'Chưa có mục tiêu Active Learning (I.6).', 'Thêm 1–2 mục tiêu ACT nêu rõ HS chủ động làm gì và gắn vào hoạt động thực hiện.');
  if (tiLeHS < 0.3) add('P1', 'Bước 7', 'AL-30', `Tỉ lệ HS hoạt động chỉ ${(tiLeHS * 100).toFixed(0)}% (<30%) — tiết thuyết giảng một chiều.`, 'Chuyển phần GV giảng thành nhiệm vụ HS thực hiện (cặp/nhóm, sản phẩm), GV chốt ngắn.');
  else if (tiLeHS < 0.5) add('P2', 'Bước 7', 'AL-50', `Tỉ lệ HS hoạt động ${(tiLeHS * 100).toFixed(0)}% (30–49%).`, 'Tăng thời lượng HS làm/nói/thảo luận lên ≥50%.');
  for (const a of giangDai) add('P2', 'Bước 7', 'AL-10P', `${a.id}: GV giảng liên tục ${a.phut_gv_thuyet_giang} phút (>10).`, 'Chia nhỏ phần giảng, xen nhiệm vụ HS.');
  for (const m of d1Missing) add('P2', 'Bước 7', 'AL-DH', `Active Learning thiếu ${m}.`, 'Bổ sung dấu hiệu này vào tiến trình.');

  // D.2 5 Giá trị & 7 Thói quen
  const d2Items = [...mt.tlim.map((t) => ({ ...t, kind: 'TLIM' })), ...mt.gia_tri_cot_loi.map((g) => ({ ...g, kind: 'GT' }))];
  const d2Missing = [];
  let d2;
  if (d2Items.length === 0) {
    d2 = 0;
    add('P2', 'Bước 7', 'GT-0', 'Không gọi đích danh giá trị cốt lõi hay thói quen TLIM nào.', 'Chọn 1–2 thói quen (1–7) hoặc giá trị (1–5), gắn vào hoạt động cụ thể có công cụ/hành vi quan sát được.');
  } else {
    const tenSai = [
      ...mt.tlim.filter((t) => !THOI_QUEN[t.thoi_quen_so]),
      ...mt.gia_tri_cot_loi.filter((g) => !GIA_TRI[g.gia_tri_so]),
    ];
    if (d2Items.length > 2 || tenSai.length) {
      d2Missing.push('DH1: gọi đích danh tối đa 02 giá trị/thói quen, đúng tên và số thứ tự');
      if (d2Items.length > 2) add('P2', 'Bước 7', 'GT-NHIEU', `Nêu ${d2Items.length} giá trị/thói quen (>2) — "chọn ít mà sâu".`, 'Giữ tối đa 2 mục làm tới nơi.');
    }
    const khongHD = d2Items.filter((it) => !hd.some((a) => (it.kind === 'TLIM' ? a.tlim_ids : a.gia_tri_ids).includes(it.id)) || blank(it.hanh_vi_quan_sat) || (it.kind === 'TLIM' && blank(it.cong_cu)));
    if (khongHD.length) d2Missing.push('DH2: mỗi giá trị/thói quen gắn MỘT hoạt động cụ thể có công cụ/hành vi quan sát được');
    const cauCN = loai('chiem_nghiem').flatMap((a) => a.cau_hoi_chiem_nghiem);
    const ids = d2Items.map((x) => x.id);
    if (!cauCN.some((q) => q.cham_vao_ids.some((x) => ids.includes(x)))) d2Missing.push('DH3: câu hỏi Chiêm nghiệm chạm trực tiếp vào giá trị/thói quen đã chọn');
    const coRubric = k.rubric.some((r) => r.tieu_chi.some((tc) => tc.lien_ket_muc_tieu.some((x) => ids.includes(x))));
    if (!coRubric) d2Missing.push('DH4: cách nhận biết mức đạt (dòng rubric/hành vi mong đợi)');
    for (const it of d2Items) {
      if (!hd.some((a) => (it.kind === 'TLIM' ? a.tlim_ids : a.gia_tri_ids).includes(it.id))) {
        add('P1', 'Bước 7', 'GT-KHD', `${it.id} nêu ở mục tiêu nhưng không hoạt động nào thực hiện.`, `Gắn ${it.id} vào một hoạt động với công cụ/hành vi quan sát được.`);
      }
    }
    for (const m of d2Missing) add('P2', 'Bước 7', 'GT-DH', `5GT&7TQ thiếu ${m}.`, 'Bổ sung dấu hiệu này.');
    d2 = d7Score(d2Missing);
  }

  // D.3 Ứng dụng AI
  const ai = k.ung_dung_ai;
  let d3 = null;
  const d3Missing = [];
  if (k.meta.su_dung_ai) {
    if (ai.giao_vien.length === 0 && !ai.hoc_sinh_duoc_dung) d3Missing.push('DH1: ghi rõ khâu dùng AI và công cụ');
    else if (ai.giao_vien.some((g) => blank(g.khau) || blank(g.cong_cu))) d3Missing.push('DH1: ghi rõ khâu dùng AI và công cụ');
    if (ai.hoc_sinh_duoc_dung && (ai.nhiem_vu_hs_duoc_dung.length === 0 || blank(ai.gioi_han) || ai.khau_bat_buoc_tu_lam.length === 0)) d3Missing.push('DH2: nhiệm vụ HS được dùng, giới hạn, khâu bắt buộc tự làm');
    if (ai.giao_vien.some((g) => blank(g.cach_kiem_chung)) || (ai.hoc_sinh_duoc_dung && blank(ai.luu_dau_vet))) d3Missing.push('DH3: cách kiểm chứng (GV rà soát; HS lưu câu lệnh/dấu vết)');
    if (blank(ai.danh_gia_phan_biet)) d3Missing.push('DH4: đánh giá phân biệt tư duy HS với phần AI hỗ trợ');
    for (const m of d3Missing) add('P2', 'Bước 7', 'AI-DH', `Ứng dụng AI thiếu ${m}.`, 'Bổ sung dấu hiệu này.');
    if (ai.hoc_sinh_duoc_dung && blank(ai.luu_dau_vet) && ai.khau_bat_buoc_tu_lam.length === 0) {
      add('P1', 'Bước 7', 'AI-THAY', 'HS dùng AI nhưng không có khâu bắt buộc tự làm và không có cách kiểm chứng.', 'Quy định khâu HS tự làm + yêu cầu lưu câu lệnh/dấu vết.');
    }
    d3 = d7Score(d3Missing);
  }
  const b7 = d3 === null ? Math.round(((d1 + d2) / 10) * 15 * 10) / 10 : d1 + d2 + d3;

  // ───────────────────────── BƯỚC 6 — PHẦN CẤU TRÚC (4PP) ─────────────────────────
  const b6Struct = {};
  if (is4PP) {
    const thuTu = ['lam_ro_ky_vong', 'thuc_hanh', 'bao_cao_danh_gia', 'chiem_nghiem', 'cung_co'];
    const coBuoc = thuTu.filter((b) => hd.some((a) => a.buoc_4pp === b));
    const viTriDau = thuTu.map((b) => hd.findIndex((a) => a.buoc_4pp === b)).filter((i) => i >= 0);
    const dungThuTu = viTriDau.every((v, i) => i === 0 || v > viTriDau[i - 1]);
    const thieuBuoc = thuTu.length - coBuoc.length;
    b6Struct.TC3 = { diem: thieuBuoc === 0 ? (dungThuTu ? 10 : 8) : thieuBuoc === 1 ? 6 : 3, toi_da: 10, ghi_chu: thieuBuoc ? `Thiếu ${thieuBuoc} bước` : dungThuTu ? 'Đủ 5 bước, đúng thứ tự' : 'Đủ 5 bước nhưng sai thứ tự' };
    if (thieuBuoc) add(thieuBuoc && !coBuoc.includes('chiem_nghiem') ? 'P1' : 'P2', 'Bước 6', 'TC3', `Tiến trình 5 bước 4PP thiếu: ${thuTu.filter((b) => !coBuoc.includes(b)).join(', ')}.`, 'Gắn các hoạt động vào đủ 5 bước: Làm rõ kỳ vọng → Thực hành → Báo cáo đánh giá → Chiêm nghiệm → Củng cố.');
    b6Struct.TC4_cau_truc = { thieu: tc4Missing };
    const tlimOK = mt.tlim.filter((t) => THOI_QUEN[t.thoi_quen_so] && !blank(t.cong_cu) && hd.some((a) => a.tlim_ids.includes(t.id)));
    b6Struct.TLIM = { diem: tlimOK.length ? 4 : mt.tlim.length ? 2 : 0, toi_da: 4 };
    const tqSet = new Set(mt.trao_quyen.filter((t) => hd.some((a) => a.trao_quyen_ids.includes(t.id))).flatMap((t) => t.tieu_chi_dap_ung).filter((x) => !tqDanhSach.length || tqDanhSach.includes(x)));
    const nTQ = tqSet.size;
    b6Struct.TQ = { diem: nTQ >= 4 ? 4 : nTQ === 3 ? 3 : nTQ >= 1 ? 2 : 0, toi_da: 4, so_tieu_chi: nTQ, tieu_chi: [...tqSet] };
    if (nTQ < 4) add('P2', 'Bước 6', 'TQ-4', `Trao quyền mới đáp ứng ${nTQ}/6 tiêu chí (cần ≥4).`, 'Bổ sung hoạt động trao quyền (lựa chọn, tự lập kế hoạch, điều phối nhóm, tự/đồng đánh giá...).');
  }

  const lv = (diem, toi_da) => levelFromPct(diem / toi_da);
  const coP1 = issues.some((i) => i.muc_do === 'P1');
  return {
    issues,
    coP1,
    diem: {
      buoc1: { diem: b1, toi_da: 15, muc: lv(b1, 15), thieu: b1Missing.map((m) => m.ten) },
      buoc4: { canh_bao: canhBaoThoiGian, tong_phut: tong, chuan_phut: chuan },
      buoc5: { diem: b5, toi_da: 20, muc: lv(b5, 20), bo_roi: boRoi.map((m) => m.id), lac: lac.map((a) => a.id) },
      buoc7: {
        diem: b7,
        toi_da: 15,
        muc: lv(b7, 15),
        d1: { diem: d1, thieu: d1Missing, ti_le_hs: Math.round(tiLeHS * 100) },
        d2: { diem: d2, thieu: d2Missing },
        d3: d3 === null ? { khong_ap_dung: true } : { diem: d3, thieu: d3Missing },
      },
      buoc6_cau_truc: b6Struct,
    },
    ma_tran: maTran,
    thong_ke: { tong_phut: tong, phut_hs: phutHS, ti_le_hs: Math.round(tiLeHS * 100) },
  };
}

// Tổng hợp điểm /100 từ kết quả quy tắc + phiếu chấm AI (nếu có).
export function tongHopDiem(v, grade) {
  const b1 = v.diem.buoc1.diem;
  const b5 = v.diem.buoc5.diem;
  const b7 = v.diem.buoc7.diem;
  let b23 = null;
  let b6 = null;
  if (grade) {
    b23 = Math.max(0, Math.min(10, grade.buoc_2_3.diem));
    const items = grade.buoc_6.map((x) => {
      // Phần kiểm được bằng quy tắc lấy giá trị nhỏ hơn giữa AI và quy tắc (không chấm khống)
      const st = v.diem.buoc6_cau_truc[x.ma];
      const diem = st && typeof st.diem === 'number' ? Math.min(x.diem, st.diem) : x.diem;
      return { ...x, diem: Math.max(0, Math.min(diem, x.toi_da)) };
    });
    const tong = items.reduce((s, x) => s + x.diem, 0);
    const toiDa = items.reduce((s, x) => s + x.toi_da, 0);
    b6 = { diem: toiDa ? Math.round((tong / toiDa) * 40 * 10) / 10 : 0, toi_da: 40, chi_tiet: items };
  }
  const coAI = b23 !== null;
  const tho = b1 + b5 + b7 + (coAI ? b23 + b6.diem : 0);
  const khaThamDinh = coAI ? 100 : 50;
  const quyDoi = Math.round((tho / khaThamDinh) * 100 * 10) / 10;
  const coP1 = v.coP1 || (grade?.van_de_chuyen_mon || []).some((x) => x.muc_do === 'P1');
  let xepLoai;
  if (quyDoi >= 85) xepLoai = 'Tốt';
  else if (quyDoi >= 70) xepLoai = 'Đạt';
  else if (quyDoi >= 50) xepLoai = 'Cần cải thiện';
  else xepLoai = 'Chưa đạt';
  let ketLuan;
  if (coP1) ketLuan = 'NỘP LẠI BẢN V2 (có lỗi P1 — quy tắc chặn duyệt)';
  else if (!coAI) ketLuan = 'CHƯA KẾT LUẬN — phần quy tắc đạt, cần chấm chuyên môn Bước 2/3 và Bước 6';
  else if (quyDoi >= 70) ketLuan = quyDoi >= 88 ? 'DUYỆT DẠY — đủ điều kiện xét Ngân hàng KHBD mẫu' : 'DUYỆT DẠY';
  else ketLuan = 'NỘP LẠI BẢN V2';
  return {
    buoc1: b1, buoc23: b23, buoc5: b5, buoc6: b6, buoc7: b7,
    diem_tho: Math.round(tho * 10) / 10,
    kha_tham_dinh: khaThamDinh,
    diem_100: quyDoi,
    xep_loai: xepLoai,
    co_p1: coP1,
    ket_luan: ketLuan,
    day_du: coAI,
  };
}
