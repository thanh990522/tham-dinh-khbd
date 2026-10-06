import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'knowledge', f), 'utf8');

let cache;
export function loadKnowledge() {
  cache ??= { kienThuc: read('kien-thuc-nen.md'), quyTrinh: read('quy-trinh-tham-dinh.md'), activeLearning: read('tieu-chi-active-learning.md') };
  return cache;
}
