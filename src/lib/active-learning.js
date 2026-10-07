// Minh chứng Active Learning tính trực tiếp từ tiến trình (không do AI tự khai) — dùng để highlight trong KHBD.
// Căn cứ: Bước 7.D1 (4 dấu hiệu) + khung ICAP trong tài liệu tiêu chí.
const ICAP = { constructive: 'Kiến tạo', interactive: 'Tương tác' };
const BAC_CAO = new Set(['phan_tich', 'danh_gia', 'sang_tao']);
const CUOI = new Set(['chiem_nghiem', 'cung_co']);

export function activityTags(a) {
  const tags = [];
  if (ICAP[a.muc_icap]) tags.push(`ICAP ${ICAP[a.muc_icap]}`);
  if (['cap_doi', 'nhom'].includes(a.hinh_thuc) && a.phan_vai.length >= 2) tags.push(`${a.hinh_thuc === 'nhom' ? 'Nhóm' : 'Cặp'} có phân vai`);
  if (a.kiem_tra_hieu_bai.co && !CUOI.has(a.loai)) tags.push('Kiểm tra nhanh');
  if (BAC_CAO.has(a.muc_bloom)) tags.push('Tư duy bậc cao');
  return tags;
}

export function evidence(k) {
  const hd = k.hoat_dong;
  const tong = hd.reduce((s, a) => s + (a.thoi_gian_phut || 0), 0);
  const phutHS = hd.reduce((s, a) => s + Math.max(0, (a.thoi_gian_phut || 0) - (a.phut_gv_thuyet_giang || 0)), 0);
  const tiLe = tong ? Math.round((phutHS / tong) * 100) : 0;
  const maxGV = hd.reduce((m, a) => Math.max(m, a.phut_gv_thuyet_giang || 0), 0);
  const nhom = hd.filter((a) => ['cap_doi', 'nhom'].includes(a.hinh_thuc) && a.phan_vai.length >= 2).map((a) => a.id);
  const kiemTra = hd.filter((a, i) => a.kiem_tra_hieu_bai.co && !CUOI.has(a.loai) && i < hd.length - 2).map((a) => a.id);
  const tuongTac = hd.filter((a) => a.muc_icap === 'interactive').map((a) => a.id);
  const kienTao = hd.filter((a) => a.muc_icap === 'constructive').map((a) => a.id);
  return [
    { ok: tiLe >= 50, text: `HS trực tiếp hoạt động ${phutHS}/${tong} phút (${tiLe}%)` },
    { ok: maxGV <= 10, text: `GV giảng liên tục tối đa ${maxGV} phút/lượt` },
    { ok: nhom.length > 0, text: `Hợp tác có phân vai: ${nhom.join(', ') || 'chưa có'}` },
    { ok: kiemTra.length > 0, text: `Kiểm tra mức hiểu giữa bài: ${kiemTra.join(', ') || 'chưa có'}` },
    { ok: tuongTac.length + kienTao.length > 0, text: `Mức ICAP cao: ${[tuongTac.length ? `Tương tác ở ${tuongTac.join(', ')}` : '', kienTao.length ? `Kiến tạo ở ${kienTao.join(', ')}` : ''].filter(Boolean).join('; ') || 'chưa có'}` },
  ];
}
