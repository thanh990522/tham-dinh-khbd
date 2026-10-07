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

test('mục tiêu Active Learning: thiếu → P2; nêu nhưng không hoạt động nào thực hiện → P1', () => {
  const k = sample();
  k.muc_tieu.active_learning = [];
  assert.ok(codes(validateKHBD(k, { config })).includes('P2:AL-MT'));
  const k2 = sample();
  for (const a of k2.hoat_dong) a.muc_tieu_ids = a.muc_tieu_ids.filter((x) => x !== 'ACT2');
  assert.ok(codes(validateKHBD(k2, { config })).includes('P1:NQ-BORoi'));
});

test('minh chứng Active Learning tính từ tiến trình và thẻ highlight từng hoạt động', async () => {
  const { evidence, activityTags } = await import('../src/lib/active-learning.js');
  const k = sample();
  const ev = evidence(k);
  assert.equal(ev.length, 5);
  assert.ok(ev.every((e) => e.ok));
  assert.match(ev[0].text, /35\/45 phút \(78%\)/);
  assert.match(ev[2].text, /HD5/);
  assert.match(ev[3].text, /HD2, HD3/);
  assert.deepEqual(activityTags(k.hoat_dong.find((a) => a.id === 'HD5')), ['ICAP Tương tác', 'Nhóm có phân vai', 'Tư duy bậc cao']);
  k.hoat_dong.forEach((a) => { a.phut_gv_thuyet_giang = a.thoi_gian_phut; });
  assert.equal(evidence(k)[0].ok, false);
});

test('tự sắp xếp: đúng trình tự, đánh số lại, cân 45 phút, giới hạn GV giảng, dọn trùng', async () => {
  const { arrangeKHBD } = await import('../src/lib/arrange.js');
  const k = sample();
  // xáo trộn: đưa Chiêm nghiệm lên đầu, lệch thời gian, GV giảng quá dài, câu hỏi trùng
  const cn = k.hoat_dong.findIndex((a) => a.loai === 'chiem_nghiem');
  k.hoat_dong.unshift(k.hoat_dong.splice(cn, 1)[0]);
  k.hoat_dong[1].thoi_gian_phut += 7;
  k.hoat_dong[2].phut_gv_thuyet_giang = 15;
  k.bo_cau_hoi_dinh_huong.nhom[0].cau_hoi.push({ ...k.bo_cau_hoi_dinh_huong.nhom[0].cau_hoi[0] });
  const before = k.hoat_dong.map((a) => a.id);
  const r = arrangeKHBD(k, config);
  assert.deepEqual(r.hoat_dong.map((a) => a.id), r.hoat_dong.map((_, i) => `HD${i + 1}`));
  assert.deepEqual(r.hoat_dong.slice(-2).map((a) => a.loai), ['chiem_nghiem', 'cung_co']);
  assert.equal(r.hoat_dong.reduce((s, a) => s + a.thoi_gian_phut, 0), 45);
  assert.ok(r.hoat_dong.every((a) => a.phut_gv_thuyet_giang <= 10 && a.phut_gv_thuyet_giang <= a.thoi_gian_phut));
  assert.equal(r.bo_cau_hoi_dinh_huong.nhom[0].cau_hoi.length, sample().bo_cau_hoi_dinh_huong.nhom[0].cau_hoi.length);
  // tham chiếu thiết bị/rubric vẫn trỏ đúng hoạt động sau khi đánh số lại
  const posterAct = r.hoat_dong.find((a) => /Production/.test(a.ten));
  assert.ok(r.rubric[0].ap_dung_cho.includes(posterAct.id));
  assert.notDeepEqual(before, r.hoat_dong.map((a) => a.id));
  assert.deepEqual(validateKHBD(r, { config }).issues, []);
});

test('Tiếng Anh: nhận loại tiết, Week/Period, tự gán stage, ưu tiên Week/Period GV nhập', async () => {
  const { arrangeKHBD } = await import('../src/lib/arrange.js');
  const { detectLessonType, detectWeekPeriod, isEnglishLesson } = await import('../src/lib/english.js');
  assert.equal(detectLessonType('Unit 2 – Lesson 2: A closer look 1'), 'A Closer Look 1');
  assert.equal(detectLessonType('LESSON 6: SKILLS 2'), 'Skills 2');
  assert.equal(detectLessonType('Lesson 7 – Looking back and Project'), 'Looking Back & Project');
  assert.deepEqual(detectWeekPeriod('Week: 3\nPeriod 12\nwe go out at the weekend'), { week: '3', period: '12' });
  assert.deepEqual(detectWeekPeriod('Tuần 5 – Tiết PPCT: 18'), { week: '5', period: '18' });
  assert.deepEqual(detectWeekPeriod('every weekend, a period of time'), { week: '', period: '' });

  const k = sample();
  assert.ok(isEnglishLesson(k));
  k.tieng_anh.loai_tiet = '';
  k.tieng_anh.khung = '';
  k.hoat_dong.forEach((a) => { a.giai_doan_ta = ''; });
  const r = arrangeKHBD(k, config, { tuan: '3', tiet_ppct: '12' });
  assert.equal(r.tieng_anh.loai_tiet, 'Getting Started');
  assert.equal(r.tieng_anh.khung, 'PPP');
  assert.deepEqual([r.meta.tuan, r.meta.tiet_ppct], ['3', '12']);
  assert.equal(r.hoat_dong[0].giai_doan_ta, 'WARM-UP');
  assert.deepEqual(r.hoat_dong.slice(-2).map((a) => a.giai_doan_ta), ['REFLECTION', 'CONSOLIDATION']);
  assert.deepEqual(validateKHBD(r, { config }).issues, []);
});

test('Tiếng Anh: góp ý P3 khi thiếu stage / Language analysis / Board plan; môn khác không bị soát', () => {
  const k = sample();
  k.hoat_dong[0].giai_doan_ta = '';
  k.tieng_anh.phan_tich_ngon_ngu = [];
  k.tieng_anh.board_plan = [];
  assert.deepEqual(codes(validateKHBD(k, { config })), ['P3:TA-STAGE', 'P3:TA-LA', 'P3:TA-BP']);
  const t = sample();
  t.meta.mon_hoc = 'Toán';
  t.meta.ngon_ngu_noi_dung = 'Tiếng Việt';
  t.tieng_anh = fillBySchema({}, KHBD_SCHEMA.properties.tieng_anh);
  t.hoat_dong.forEach((a) => { a.giai_doan_ta = ''; });
  assert.ok(!codes(validateKHBD(t, { config })).some((c) => c.includes('TA-')));
});
