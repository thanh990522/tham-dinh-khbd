import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateKHBD, tongHopDiem } from '../src/lib/validator.js';
import { fillBySchema } from '../src/lib/ai.js';
import { KHBD_SCHEMA } from '../src/lib/schema.js';
import { loadConfig } from '../src/lib/config.js';

const config = loadConfig();
const sample = () => fillBySchema(JSON.parse(fs.readFileSync(new URL('../samples/TA7_Unit2_Lesson1.khbd.json', import.meta.url), 'utf8')), KHBD_SCHEMA);
const codes = (v) => v.issues.map((i) => `${i.muc_do}:${i.ma}`);

test('mẫu TA7 Lesson 1 đạt toàn bộ phần kiểm tra theo quy tắc', () => {
  const v = validateKHBD(sample(), { config });
  assert.deepEqual(v.issues, []);
  assert.equal(v.diem.buoc1.diem, 15);
  assert.equal(v.diem.buoc5.diem, 20);
  assert.equal(v.diem.buoc7.diem, 15);
  assert.equal(v.diem.buoc4.tong_phut, 45);
  assert.ok(v.thong_ke.ti_le_hs >= 60);
  assert.equal(v.diem.buoc6_cau_truc.TQ.so_tieu_chi, 6);
});

test('thiếu Chiêm nghiệm → lỗi P1 và chặn duyệt', () => {
  const k = sample();
  const cn = k.hoat_dong.find((a) => a.loai === 'chiem_nghiem');
  k.hoat_dong = k.hoat_dong.filter((a) => a !== cn);
  k.hoat_dong.find((a) => a.loai === 'cung_co').thoi_gian_phut += cn.thoi_gian_phut;
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P1:KM-CN'));
  assert.ok(v.coP1);
  assert.match(tongHopDiem(v, null).ket_luan, /NỘP LẠI BẢN V2/);
});

test('mục tiêu không có hoạt động thực hiện → P1 (Bước 5)', () => {
  const k = sample();
  k.muc_tieu.kien_thuc.push({ id: 'KT9', noi_dung: 'Mục tiêu bị bỏ rơi' });
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P1:NQ-BORoi'));
  assert.ok(v.diem.buoc5.diem <= 13);
});

test('hoạt động không gắn mục tiêu → hoạt động lạc (P2)', () => {
  const k = sample();
  k.hoat_dong.find((a) => a.id === 'HD4').muc_tieu_ids = [];
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P2:NQ-LAC'));
});

test('tổng thời gian lệch số tiết → P2 Bước 4', () => {
  const k = sample();
  k.hoat_dong[0].thoi_gian_phut += 5;
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P2:TG-TONG'));
  assert.equal(v.diem.buoc4.tong_phut, 50);
});

test('tiết thuyết giảng (HS < 30%) → P1 Active Learning', () => {
  const k = sample();
  for (const a of k.hoat_dong) a.phut_gv_thuyet_giang = a.thoi_gian_phut;
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P1:AL-30'));
  assert.ok(v.diem.buoc7.d1.diem <= 3);
});

test('GV giảng liên tục > 10 phút bị cảnh báo', () => {
  const k = sample();
  const a = k.hoat_dong.find((x) => x.id === 'HD5');
  a.phut_gv_thuyet_giang = 11;
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P2:AL-10P'));
});

test('quá 2 giá trị/thói quen → không đạt dấu hiệu 1 của 5GT&7TQ', () => {
  const k = sample();
  k.muc_tieu.tlim.push({ id: 'TL2', thoi_quen_so: 6, ten_thoi_quen: 'Hợp lực', cong_cu: 'Giải pháp thứ 3', hanh_vi_quan_sat: 'x' });
  k.hoat_dong[4].tlim_ids.push('TL2');
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P2:GT-NHIEU'));
  assert.equal(v.diem.buoc7.d2.diem, 4);
});

test('thói quen nêu ở mục tiêu nhưng không hoạt động nào thực hiện → P1', () => {
  const k = sample();
  for (const a of k.hoat_dong) a.tlim_ids = [];
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P1:GT-KHD'));
});

test('LikeAbility dưới 3 cấp độ → P1', () => {
  const k = sample();
  k.meta.phuong_phap = 'LA';
  k.dac_thu_phuong_phap.cap_do_likeability = [
    { ten: 'Cơ bản', muc_bloom: 'Hiểu', muc_tieu: 'a', nhiem_vu: [{ hoi: 'q', goi_y_dap_an: 'a' }], nguong_len_cap: '80%' },
    { ten: 'Khá', muc_bloom: 'Vận dụng', muc_tieu: 'b', nhiem_vu: [{ hoi: 'q', goi_y_dap_an: 'a' }], nguong_len_cap: '80%' },
  ];
  const v = validateKHBD(k, { config });
  assert.ok(codes(v).includes('P1:PP-LA3'));
});

test('thiếu bộ câu hỏi định hướng ở tiết 4PP → P1; ở tiết thường → P2', () => {
  const k = sample();
  k.bo_cau_hoi_dinh_huong.nhom = [];
  assert.ok(codes(validateKHBD(k, { config })).includes('P1:KM-CHDH'));
  k.meta.phuong_phap = 'THUONG';
  assert.ok(codes(validateKHBD(k, { config })).includes('P2:KM-CHDH'));
});

test('có dùng AI nhưng thiếu dấu hiệu → trừ điểm D3; không dùng AI → loại khỏi mẫu số', () => {
  const k = sample();
  const v0 = validateKHBD(k, { config });
  assert.equal(v0.diem.buoc7.d3.khong_ap_dung, true);
  k.meta.su_dung_ai = true;
  k.ung_dung_ai.giao_vien = [{ khau: 'Soạn câu hỏi', cong_cu: 'Claude', cach_kiem_chung: '' }];
  const v = validateKHBD(k, { config });
  assert.ok(v.diem.buoc7.d3.diem < 5);
  assert.ok(v.diem.buoc7.d3.thieu.some((t) => t.startsWith('DH3')));
  assert.ok(v.diem.buoc7.d3.thieu.some((t) => t.startsWith('DH4')));
});

test('tổng hợp điểm /100 với phiếu chấm AI, lấy điểm thấp hơn ở phần cấu trúc', () => {
  const k = sample();
  const v = validateKHBD(k, { config });
  const grade = {
    buoc_2_3: { diem: 9, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
    buoc_6: [
      { ma: 'TC1', ten: '', diem: 10, toi_da: 10, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
      { ma: 'TC3', ten: '', diem: 10, toi_da: 10, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
      { ma: 'TC4', ten: '', diem: 10, toi_da: 12, muc: 'Đạt', can_cu: '', cach_lay_lai_diem: '' },
      { ma: 'TLIM', ten: '', diem: 4, toi_da: 4, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
      { ma: 'TQ', ten: '', diem: 4, toi_da: 4, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
    ],
    van_de_chuyen_mon: [],
    plus: [], delta: [], hoat_dong_hay: '',
  };
  const s = tongHopDiem(v, grade);
  assert.equal(s.day_du, true);
  assert.equal(s.buoc6.diem, 38); // (10+10+10+4+4)/40 × 40
  assert.equal(s.diem_100, 15 + 9 + 20 + 38 + 15);
  assert.equal(s.xep_loai, 'Tốt');
  assert.match(s.ket_luan, /DUYỆT DẠY/);
  // AI báo lỗi chuyên môn P1 → chặn duyệt dù điểm cao
  const s2 = tongHopDiem(v, { ...grade, van_de_chuyen_mon: [{ muc_do: 'P1', vi_tri: 'HD3', van_de: 'Đáp án sai', de_xuat_sua: 'Sửa' }] });
  assert.match(s2.ket_luan, /NỘP LẠI BẢN V2/);
});
