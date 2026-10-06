// Kiểm tra + xuất Word cho một (hoặc nhiều) KHBD dạng JSON, không cần AI.
// Dùng: node scripts/render-sample.js <file.json> [thư_mục_ra] [giáo_án_gốc.docx — để lấy hình [HÌNH n]] [số tiết trong file gốc]
import fs from 'node:fs';
import path from 'node:path';
import { validateKHBD, tongHopDiem } from '../src/lib/validator.js';
import { fillBySchema } from '../src/lib/ai.js';
import { KHBD_SCHEMA } from '../src/lib/schema.js';
import { renderKHBDDocx, renderReportDocx } from '../src/lib/render-docx.js';
import { loadConfig } from '../src/lib/config.js';
import { extractText, splitLessons, imageRefs } from '../src/lib/parse-input.js';

const file = process.argv[2] || 'samples/TA7_Unit2_Lesson1.khbd.json';
const outDir = process.argv[3] || 'samples/output';
const config = loadConfig();
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = (Array.isArray(raw) ? raw : [raw]).map((k) => fillBySchema(k, KHBD_SCHEMA));
const results = list.map((khbd) => {
  const v = validateKHBD(khbd, { config });
  const s = tongHopDiem(v, null);
  return { part: { tieu_de: khbd.meta.ten_bai }, pre: null, khbd, validation: v, grade: null, score: s, history: [{ vong: 0, ...s, so_loi: v.issues.length }] };
});
for (const r of results) {
  const d = r.validation.diem;
  console.log(`\n${r.khbd.meta.ten_bai}`);
  console.log(`  Bước 1: ${d.buoc1.diem}/15 · Bước 5: ${d.buoc5.diem}/20 · Bước 7: ${d.buoc7.diem}/15 (AL ${d.buoc7.d1.diem}/5, HS ${d.buoc7.d1.ti_le_hs}% · 5GT&7TQ ${d.buoc7.d2.diem}/5 · AI ${d.buoc7.d3.khong_ap_dung ? 'không áp dụng' : d.buoc7.d3.diem + '/5'})`);
  console.log(`  Bước 4: ${d.buoc4.tong_phut}/${d.buoc4.chuan_phut} phút ${d.buoc4.canh_bao.join(' ')}`);
  console.log(`  Bước 6 cấu trúc: ${JSON.stringify(d.buoc6_cau_truc)}`);
  console.log(`  Phần quy tắc: ${r.score.diem_tho}/${r.score.kha_tham_dinh} → ${r.score.diem_100}/100 (tham khảo) · P1: ${r.score.co_p1}`);
  for (const i of r.validation.issues) console.log(`  [${i.muc_do}] ${i.buoc} ${i.ma}: ${i.van_de}`);
}
fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(file).replace(/\.khbd\.json$|\.json$/, '');
let images = [];
let refs = [];
if (process.argv[4]) {
  const orig = await extractText(fs.readFileSync(process.argv[4]), process.argv[4]);
  images = orig.images || [];
  const part = splitLessons(orig.text).find((p) => p.so === Number(process.argv[5] || 1));
  refs = list.map(() => (part ? imageRefs(part.text) : []));
}
fs.writeFileSync(path.join(outDir, `${base}_KHBD.docx`), await renderKHBDDocx(list, config, { images, refs }));
fs.writeFileSync(path.join(outDir, `${base}_BaoCao.docx`), await renderReportDocx(results, { config, mode: 'nang_cap' }));
console.log(`\nĐã xuất: ${outDir}/${base}_KHBD.docx, ${base}_BaoCao.docx`);
