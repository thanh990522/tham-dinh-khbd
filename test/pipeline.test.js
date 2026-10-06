import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runJob } from '../src/lib/pipeline.js';
import { fillBySchema } from '../src/lib/ai.js';
import { KHBD_SCHEMA } from '../src/lib/schema.js';
import { loadConfig } from '../src/lib/config.js';

const config = loadConfig();
const sample = () => fillBySchema(JSON.parse(fs.readFileSync(new URL('../samples/TA7_Unit2_Lesson1.khbd.json', import.meta.url), 'utf8')), KHBD_SCHEMA);
const grade = {
  buoc_2_3: { diem: 9, muc: 'Tốt', can_cu: 'Bám YCCĐ', cach_lay_lai_diem: '' },
  buoc_6: [
    { ma: 'TC1', ten: 'Mục đích pp', diem: 10, toi_da: 10, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
    { ma: 'TC3', ten: 'Tiến trình', diem: 10, toi_da: 10, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
    { ma: 'TC4', ten: 'Đặc thù', diem: 11, toi_da: 12, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: 'Liên kết chặt hơn HD5–HD6' },
    { ma: 'TLIM', ten: 'TLIM', diem: 4, toi_da: 4, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
    { ma: 'TQ', ten: 'Trao quyền', diem: 4, toi_da: 4, muc: 'Tốt', can_cu: '', cach_lay_lai_diem: '' },
  ],
  van_de_chuyen_mon: [],
  plus: ['Giữ nguyên ngữ liệu gốc'],
  delta: [],
  hoat_dong_hay: 'HD5',
};

function fakeJob() {
  const events = [];
  return { events, emit: (e) => events.push(e) };
}

test('vòng tự sửa: bản đầu thiếu Chiêm nghiệm → sửa → đạt, xuất đủ 3 file', async () => {
  const calls = { gen: 0, rev: 0, grade: 0 };
  const flawed = sample();
  const cn = flawed.hoat_dong.find((a) => a.loai === 'chiem_nghiem');
  flawed.hoat_dong = flawed.hoat_dong.filter((a) => a !== cn);
  flawed.hoat_dong.find((a) => a.loai === 'cung_co').thoi_gian_phut += cn.thoi_gian_phut;
  const deps = {
    aiAvailable: () => true,
    research: async () => ({ tom_tat: 'YCCĐ…', nguon: ['https://example.org/a'] }),
    generateKHBD: async () => { calls.gen++; return flawed; },
    reviseKHBD: async ({ issues }) => {
      calls.rev++;
      assert.ok(issues.some((i) => i.ma === 'KM-CN'), 'lỗi thiếu Chiêm nghiệm phải được chuyển cho bước sửa');
      return sample();
    },
    gradeKHBD: async () => { calls.grade++; return grade; },
  };
  const job = fakeJob();
  const res = await runJob(job, {
    parts: [{ so: 1, tieu_de: 'Lesson 1', text: 'Lesson 1: Getting started\n| WARM-UP | 5 mins |' }],
    input: { kind: 'text', text: '' },
    opts: { truong: config.truong, so_tiet: 1, tra_cuu: true, phuong_phap: 'AUTO' },
    mode: 'nang_cap',
    config,
  }, deps);
  assert.deepEqual(calls, { gen: 1, rev: 1, grade: 2 });
  const t = res.tom_tat[0];
  assert.equal(t.co_p1, false);
  assert.equal(t.lich_su.length, 2);
  assert.ok(t.lich_su[1] >= 88, `điểm sau sửa ${t.lich_su[1]}`);
  assert.match(t.ket_luan, /DUYỆT DẠY/);
  assert.deepEqual(Object.keys(res.files).sort(), ['Bao_cao_tham_dinh.docx', 'KHBD.json', 'KHBD_hoan_chinh.docx']);
});

test('chế độ thẩm định: không tự sửa, không xuất KHBD mới', async () => {
  const deps = {
    aiAvailable: () => true,
    research: async () => null,
    generateKHBD: async ({ mode }) => { assert.equal(mode, 'trich_xuat'); return sample(); },
    reviseKHBD: async () => { throw new Error('không được gọi'); },
    gradeKHBD: async () => grade,
  };
  const res = await runJob(fakeJob(), {
    parts: [{ so: 1, tieu_de: 'Lesson 1', text: 'abc' }],
    input: { kind: 'text', text: 'abc' },
    opts: { truong: config.truong, so_tiet: 1, tra_cuu: false },
    mode: 'tham_dinh',
    config,
  }, deps);
  assert.ok(!res.files['KHBD_hoan_chinh.docx']);
  assert.ok(res.files['Bao_cao_tham_dinh.docx']);
});

test('không có khoá API: chỉ rà soát sơ bộ, vẫn xuất báo cáo', async () => {
  const res = await runJob(fakeJob(), {
    parts: [{ so: 1, tieu_de: 'Lesson 1', text: 'I. Objectives\n| WARM-UP | 5 mins |' }],
    input: { kind: 'text', text: '' },
    opts: { truong: config.truong, so_tiet: 1 },
    mode: 'nang_cap',
    config,
  }, { aiAvailable: () => false });
  assert.equal(res.tom_tat[0].ket_luan, 'Chỉ rà soát sơ bộ');
  assert.ok(res.files['Bao_cao_tham_dinh.docx']);
});
