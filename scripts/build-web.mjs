// Đóng gói bản web chạy trong Artifact claude.ai: web-artifact/dist/{index.html, docx.iife.js, mammoth.browser.min.js}
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'web-artifact', 'dist');
fs.mkdirSync(dist, { recursive: true });

const res = await build({
  entryPoints: [path.join(root, 'web-artifact/src/main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  write: false,
  charset: 'utf8',
  loader: { '.md': 'text', '.json': 'json' },
  alias: {
    docx: path.join(root, 'web-artifact/src/shims/docx.cjs'),
    mammoth: path.join(root, 'web-artifact/src/shims/mammoth.cjs'),
  },
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(path.join(root, 'web-artifact/page.html'), 'utf8').replace('/*BUNDLE*/', () => js);
fs.writeFileSync(path.join(dist, 'index.html'), html);
// Ký tự U+FFFD xuất hiện có chủ đích trong chuỗi của thư viện → viết lại dạng escape \ufffd (cùng giá trị)
const copyLib = (from, to) => fs.writeFileSync(path.join(dist, to), fs.readFileSync(path.join(root, from), 'utf8').replace(/\uFFFD/g, '\\ufffd'));
copyLib('node_modules/docx/dist/index.iife.js', 'docx.iife.js');
copyLib('node_modules/mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js');
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
