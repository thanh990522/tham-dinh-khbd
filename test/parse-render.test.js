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

test('imageSize đọc kích thước PNG/JPEG; imageRefs tìm ký hiệu [HÌNH n]', async () => {
  const { imageSize, imageRefs } = await import('../src/lib/parse-input.js');
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x49484452, 12);
  png.writeUInt32BE(300, 16);
  png.writeUInt32BE(200, 20);
  assert.deepEqual(imageSize(png, 'png'), { width: 300, height: 200 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0x96]);
  assert.deepEqual(imageSize(jpg, 'jpg'), { width: 150, height: 100 });
  assert.deepEqual(imageRefs('a [HÌNH 2] b [HÌNH 5] c [HÌNH 2]'), [2, 5]);
});

test('xuất Word chèn ảnh gốc tại [HÌNH n] và phụ lục ảnh chưa dùng', async () => {
  // PNG 1×1 hợp lệ, khai báo kích thước 40×40 để không bị coi là ảnh đệm
  const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  const k = sample();
  k.hoat_dong[1].noi_dung += ' [HÌNH 1]';
  const buf = await renderKHBDDocx([k], config, { images: [{ n: 1, type: 'png', data, width: 40, height: 40 }, { n: 2, type: 'png', data, width: 40, height: 40 }], refs: [[1, 2]] });
  const zip = buf.toString('latin1');
  assert.match(zip, /word\/media\//);
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
});
