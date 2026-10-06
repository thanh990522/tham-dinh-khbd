import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlToText, splitLessons, preAudit, extractText } from '../src/lib/parse-input.js';
import { fillBySchema } from '../src/lib/ai.js';
import { KHBD_SCHEMA } from '../src/lib/schema.js';
import { renderKHBDDocx, renderReportDocx } from '../src/lib/render-docx.js';
import { validateKHBD, tongHopDiem } from '../src/lib/validator.js';
import { loadConfig } from '../src/lib/config.js';

const config = loadConfig();
const sample = () => fillBySchema(JSON.parse(fs.readFileSync(new URL('../samples/TA7_Unit2_Lesson1.khbd.json', import.meta.url), 'utf8')), KHBD_SCHEMA);

test('htmlToText giữ cấu trúc bảng, mỗi hàng một dòng', () => {
  const t = htmlToText('<p>I. MỤC TIÊU</p><table><tr><th><p>Stage</p></th><th><p>Time</p></th></tr><tr><td><p>WARM-UP</p><p>Brainstorm</p></td><td><p>5 mins</p></td></tr></table>');
  assert.match(t, /\| Stage \| Time \|/);
  assert.match(t, /\| WARM-UP \/ Brainstorm \| 5 mins \|/);
});

test('splitLessons tách nhiều tiết, bỏ tiêu đề lặp trong bảng ghi bảng', () => {
  const body = (n) => `Lesson ${n}: Bài ${n}\nI. OBJECTIVES\n${'Nội dung chi tiết của tiết. '.repeat(20)}\n| Board | Lesson ${n}: Bài ${n} |`;
  const parts = splitLessons(`UNIT 2: HEALTHY LIVING\n${body(1)}\nUNIT 2: HEALTHY LIVING\n${body(2)}`);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.so), [1, 2]);
  assert.match(parts[1].text, /^UNIT 2/);
});

test('splitLessons trả 1 phần khi chỉ có một tiết', () => {
  assert.equal(splitLessons('Tiết 5: Ôn tập\nnội dung').length, 1);
});

test('preAudit phát hiện thiếu Chiêm nghiệm và cộng thời gian từ ô bảng', () => {
  const a = preAudit('I. Mục tiêu\n1. Kiến thức\n| WARM-UP | 5 mins |\n| PRACTICE | 30 mins |\n| CONSOLIDATION | 5 mins |', 45);
  assert.equal(a.thoi_gian.tong, 40);
  assert.equal(a.thoi_gian.khop, false);
  assert.equal(a.items.find((i) => i.ma === 'CN').co, false);
  assert.equal(a.items.find((i) => i.ma === 'CC').co, true);
});

test('extractText từ chối .doc cũ với hướng dẫn rõ ràng', async () => {
  await assert.rejects(() => extractText(Buffer.from(''), 'x.doc'), /Lưu thành/);
});

test('fillBySchema điền đủ trường còn thiếu và sửa enum sai', () => {
  const k = fillBySchema({ meta: { phuong_phap: 'XYZ' }, hoat_dong: [{ id: 'HD1', buoc_4pp: 'abc' }] }, KHBD_SCHEMA);
  assert.equal(k.meta.phuong_phap, 'THUONG');
  assert.equal(k.hoat_dong[0].buoc_4pp, 'khac');
  assert.deepEqual(k.hoat_dong[0].to_chuc, { giao_nhiem_vu: '', thuc_hien_nhiem_vu: '', bao_cao_thao_luan: '', ket_luan_nhan_dinh: '' });
  assert.deepEqual(k.muc_tieu.tlim, []);
});

test('xuất Word KHBD (4PP và tiết thường) và báo cáo thành file .docx hợp lệ', async () => {
  const k4 = sample();
  const kt = sample();
  kt.meta.phuong_phap = 'THUONG';
  const buf = await renderKHBDDocx([k4, kt], config);
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const v = validateKHBD(k4, { config });
  const rep = await renderReportDocx([{ part: { tieu_de: 'x' }, pre: preAudit('abc'), khbd: k4, validation: v, grade: null, score: tongHopDiem(v, null), history: [] }], { config, mode: 'nang_cap' });
  assert.equal(rep.subarray(0, 2).toString(), 'PK');
});
