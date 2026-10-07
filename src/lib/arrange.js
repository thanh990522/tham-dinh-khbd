// Tự điều chỉnh, sắp xếp KHBD sau khi AI viết (chạy trước bộ kiểm tra) — chỉ sửa cơ học, không đổi nội dung chuyên môn:
//  • sắp hoạt động đúng trình tự tiết học, đánh số lại HD1…n và cập nhật mọi tham chiếu
//  • cân thời lượng để tổng đúng 45 × số tiết (Chiêm nghiệm/Củng cố ≥ 3 phút)
//  • giới hạn thời gian GV giảng ≤ 10 phút/lượt và ≤ thời lượng hoạt động
//  • bỏ mục rỗng, mục trùng, tham chiếu hỏng
import { isEnglishLesson, detectLessonType, defaultStage, GOI_Y_LOAI_TIET } from './english.js';

export { isEnglishLesson };

const THU_TU_LOAI = ['khoi_dong', 'xac_dinh_nhiem_vu', 'hinh_thanh_kien_thuc', 'luyen_tap', 'van_dung', 'chiem_nghiem', 'cung_co'];
const THU_TU_BUOC = ['lam_ro_ky_vong', 'thuc_hanh', 'khac', 'bao_cao_danh_gia', 'chiem_nghiem', 'cung_co'];
const CUOI = ['chiem_nghiem', 'cung_co'];

const clean = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const v = String(key ? x[key] : x).trim().toLowerCase();
    if (!v || seen.has(v)) return false;
    seen.add(v);
    return true;
  });
};

// opts: thông tin GV nhập trên trang (tuần, tiết PPCT…) — luôn ưu tiên hơn giá trị AI điền
export function arrangeKHBD(input, config = {}, opts = {}) {
  const k = structuredClone(input);
  if (opts.tuan) k.meta.tuan = String(opts.tuan);
  if (opts.tiet_ppct) k.meta.tiet_ppct = String(opts.tiet_ppct);
  const is4PP = k.meta.phuong_phap !== 'THUONG';
  const phutTiet = (config.phut_moi_tiet || 45) * (k.meta.so_tiet || 1);

  // 1. Trình tự: giữ thứ tự gốc trong cùng nhóm; Chiêm nghiệm → Củng cố luôn ở cuối
  const rank = (a) => {
    if (a.loai === 'chiem_nghiem') return 100;
    if (a.loai === 'cung_co') return 101;
    return is4PP ? THU_TU_BUOC.indexOf(a.buoc_4pp) : THU_TU_LOAI.indexOf(a.loai);
  };
  k.hoat_dong = k.hoat_dong.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map((x) => x.a);
  if (is4PP) {
    k.hoat_dong.forEach((a) => {
      if (a.loai === 'chiem_nghiem') a.buoc_4pp = 'chiem_nghiem';
      if (a.loai === 'cung_co') a.buoc_4pp = 'cung_co';
    });
  }

  // 2. Đánh số lại HD1…n và cập nhật tham chiếu
  const map = new Map(k.hoat_dong.map((a, i) => [a.id, `HD${i + 1}`]));
  k.hoat_dong.forEach((a) => { a.id = map.get(a.id); });
  const remap = (ids) => [...new Set(ids.map((x) => map.get(x)).filter(Boolean))];
  k.thiet_bi_hoc_lieu.forEach((t) => { t.dung_cho_hoat_dong = remap(t.dung_cho_hoat_dong); });
  k.rubric.forEach((r) => { r.ap_dung_cho = remap(r.ap_dung_cho); });
  const sub = (s) => String(s || '').replace(/\bHD\d+\b/g, (m) => map.get(m) || m);

  // 3. Dọn mục rỗng/trùng
  const mt = k.muc_tieu;
  for (const key of ['kien_thuc', 'nang_luc_chung', 'nang_luc_dac_thu', 'pham_chat', 'active_learning']) if (mt[key]) mt[key] = clean(mt[key], 'noi_dung');
  k.thiet_bi_hoc_lieu = clean(k.thiet_bi_hoc_lieu, 'ten');
  k.du_kien_kho_khan = clean(k.du_kien_kho_khan, 'kho_khan');
  k.can_cu_chuong_trinh.yeu_cau_can_dat = clean(k.can_cu_chuong_trinh.yeu_cau_can_dat);
  k.bo_cau_hoi_dinh_huong.nhom = k.bo_cau_hoi_dinh_huong.nhom.map((n) => ({ ...n, cau_hoi: clean(n.cau_hoi, 'hoi') })).filter((n) => n.cau_hoi.length);
  k.rubric = k.rubric.map((r) => ({ ...r, tieu_chi: clean(r.tieu_chi, 'ten') })).filter((r) => r.tieu_chi.length);
  const rubricIds = new Set(k.rubric.map((r) => r.id));
  k.hoat_dong.forEach((a) => {
    a.phan_vai = clean(a.phan_vai, 'vai');
    a.cau_hoi_chiem_nghiem = clean(a.cau_hoi_chiem_nghiem, 'hoi');
    a.rubric_ids = a.rubric_ids.filter((x) => rubricIds.has(x));
    for (const f of ['noi_dung', 'san_pham', 'muc_tieu_hoat_dong']) a[f] = sub(a[f]).trim();
    for (const f of Object.keys(a.to_chuc)) a.to_chuc[f] = sub(a.to_chuc[f]).trim();
  });

  // 3b. Tiếng Anh: loại tiết, khung, stage của từng hoạt động; dọn bảng phân tích ngôn ngữ
  if (k.tieng_anh && isEnglishLesson(k)) {
    const ta = k.tieng_anh;
    if (!ta.loai_tiet) ta.loai_tiet = detectLessonType(`${k.meta.ten_bai} ${opts.loai_tiet || ''}`);
    if (opts.loai_tiet) ta.loai_tiet = opts.loai_tiet;
    if (!ta.khung) ta.khung = GOI_Y_LOAI_TIET[ta.loai_tiet]?.khung || 'PPP';
    ta.phan_tich_ngon_ngu = clean(ta.phan_tich_ngon_ngu, 'form');
    ta.board_plan = ta.board_plan.map((x) => String(x).trim()).filter(Boolean);
    k.hoat_dong.forEach((a) => { if (!a.giai_doan_ta) a.giai_doan_ta = defaultStage(a, ta.khung); });
  }

  // 4. Thời lượng
  k.hoat_dong.forEach((a) => {
    a.thoi_gian_phut = Math.max(1, Math.round(a.thoi_gian_phut || 0));
    if (CUOI.includes(a.loai) && a.thoi_gian_phut < 3) a.thoi_gian_phut = 3;
  });
  let diff = phutTiet - k.hoat_dong.reduce((s, a) => s + a.thoi_gian_phut, 0);
  const coGian = () => k.hoat_dong.filter((a) => !CUOI.includes(a.loai)).sort((x, y) => y.thoi_gian_phut - x.thoi_gian_phut);
  for (let guard = 0; diff !== 0 && guard < 200; guard++) {
    const list = coGian();
    if (!list.length) break;
    const a = diff > 0 ? list[0] : list.find((x) => x.thoi_gian_phut > 2);
    if (!a) break;
    a.thoi_gian_phut += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  k.hoat_dong.forEach((a) => {
    a.phut_gv_thuyet_giang = Math.max(0, Math.min(10, a.thoi_gian_phut, Math.round(a.phut_gv_thuyet_giang || 0)));
  });
  return k;
}
