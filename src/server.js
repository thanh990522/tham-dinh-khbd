import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { extractText, splitLessons, preAudit } from './lib/parse-input.js';
import { runJob } from './lib/pipeline.js';
import { serverKeyAvailable } from './lib/ai.js';
import { loadConfig, saveConfig } from './lib/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const TTL = 2 * 60 * 60 * 1000;
const MAX_RUNNING = Number(process.env.MAX_RUNNING_JOBS || 2);

const inputs = new Map(); // file_id → { input, parts, filename, at }
const jobs = new Map(); // job_id → Job

class Job extends EventEmitter {
  constructor() {
    super();
    this.id = crypto.randomUUID();
    this.events = [];
    this.status = 'queued';
    this.result = null;
    this.at = Date.now();
  }
  emit(ev) {
    if (typeof ev === 'object') {
      const e = { t: Date.now(), ...ev };
      this.events.push(e);
      return super.emit('ev', e);
    }
    return super.emit(ev);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of inputs) if (now - v.at > TTL) inputs.delete(k);
  for (const [k, v] of jobs) if (now - v.at > TTL && v.status !== 'running') jobs.delete(k);
}, 10 * 60 * 1000).unref();

// Mã truy cập (khuyến nghị bật khi đưa lên Internet vì mỗi lượt soạn tốn phí API)
app.use('/api', (req, res, next) => {
  const code = process.env.ACCESS_CODE;
  if (!code || req.path === '/status') return next();
  const got = req.get('x-access-code') || req.query.code;
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  if (got && crypto.timingSafeEqual(digest(got), digest(code))) return next();
  res.status(401).json({ error: 'Sai hoặc thiếu mã truy cập.' });
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(here, '..', 'public')));

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

app.get('/api/status', (_req, res) => {
  res.json({
    ai: serverKeyAvailable(),
    ai_may_chu: serverKeyAvailable(),
    model: config.model,
    can_ma: Boolean(process.env.ACCESS_CODE),
    truong: config.truong,
    nam_hoc: config.nam_hoc,
    diem_muc_tieu: config.diem_muc_tieu,
    so_vong: config.so_vong_tu_sua_toi_da,
    tieu_chi_trao_quyen: config.tieu_chi_trao_quyen,
    to_chuyen_mon_mac_dinh: config.to_chuyen_mon_mac_dinh,
    tra_cuu_web: config.tra_cuu_web,
    sua_cau_hinh: Boolean(process.env.ADMIN_CODE) ? 'can_ma' : 'chi_may_nay',
  });
});

// Cài đặt của tổ/trường: 6 tiêu chí Trao quyền chính thức, điểm mục tiêu, số vòng tự sửa…
// Có ADMIN_CODE → cần mã quản trị; không có → chỉ sửa được khi mở web trên chính máy chạy chương trình.
app.put('/api/config', (req, res) => {
  const admin = process.env.ADMIN_CODE;
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  const got = req.get('x-admin-code');
  const ok = admin ? Boolean(got) && crypto.timingSafeEqual(digest(got), digest(admin)) : isLocal(req);
  if (!ok) return res.status(403).json({ error: admin ? 'Sai mã quản trị.' : 'Chỉ sửa cài đặt được trên máy đang chạy chương trình (hoặc đặt ADMIN_CODE).' });
  const b = req.body || {};
  const ds = Array.isArray(b.tieu_chi_trao_quyen) ? b.tieu_chi_trao_quyen.map((x) => String(x || '').trim()).filter(Boolean) : null;
  if (ds && ds.length !== 6) return res.status(400).json({ error: 'Cần đúng 6 tiêu chí Trao quyền.' });
  if (ds) {
    config.tieu_chi_trao_quyen.danh_sach = ds.map((ten, i) => ({ ma: `TQ-${'abcdef'[i]}`, ten }));
    config.tieu_chi_trao_quyen.da_xac_nhan = true;
    config.tieu_chi_trao_quyen._GHI_CHU = `Danh sách chính thức do nhà trường/tổ cập nhật ngày ${new Date().toLocaleDateString('vi-VN')}.`;
  }
  if (b.diem_muc_tieu !== undefined) config.diem_muc_tieu = Math.max(70, Math.min(100, Number(b.diem_muc_tieu) || 88));
  if (b.so_vong_tu_sua_toi_da !== undefined) config.so_vong_tu_sua_toi_da = Math.max(0, Math.min(4, Number(b.so_vong_tu_sua_toi_da) || 0));
  if (b.to_chuyen_mon_mac_dinh !== undefined) config.to_chuyen_mon_mac_dinh = String(b.to_chuyen_mon_mac_dinh).slice(0, 100);
  if (b.tra_cuu_web !== undefined) config.tra_cuu_web = Boolean(b.tra_cuu_web);
  try {
    saveConfig(config);
  } catch (err) {
    return res.status(500).json({ error: `Đã áp dụng nhưng không lưu được file cấu hình: ${err.message}` });
  }
  res.json({ ok: true });
});

// Bước 1: tải file lên → đọc, tách tiết, rà soát sơ bộ
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file.' });
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const so_tiet = Number(req.body.so_tiet) || 1;
    let input;
    let parts;
    if (/\.json$/i.test(filename)) {
      const raw = JSON.parse(req.file.buffer.toString('utf8'));
      const list = Array.isArray(raw) ? raw : [raw];
      input = { kind: 'json', text: '' };
      parts = list.map((k, i) => ({ so: i + 1, tieu_de: k?.meta?.ten_bai || `KHBD ${i + 1}`, text: '', khbd: k }));
    } else {
      input = await extractText(req.file.buffer, filename);
      parts = input.kind === 'pdf' ? [{ so: 1, tieu_de: filename.replace(/\.pdf$/i, ''), text: '' }] : splitLessons(input.text);
    }
    const id = crypto.randomUUID();
    inputs.set(id, { input, parts, filename, at: Date.now() });
    res.json({
      file_id: id,
      filename,
      kind: input.kind,
      warnings: input.warnings || [],
      lessons: parts.map((p) => ({
        so: p.so,
        tieu_de: p.tieu_de,
        do_dai: p.text.length,
        pre: p.text ? preAudit(p.text, config.phut_moi_tiet * so_tiet) : null,
        la_json: Boolean(p.khbd),
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bước 2: tạo job soạn/nâng cấp/thẩm định
app.post('/api/jobs', (req, res) => {
  const { file_id, lessons, opts = {}, mode = 'nang_cap' } = req.body || {};
  const running = [...jobs.values()].filter((j) => j.status === 'running').length;
  if (running >= MAX_RUNNING) {
    return res.status(429).json({ error: 'Hệ thống đang xử lý nhiều yêu cầu, vui lòng thử lại sau ít phút.' });
  }
  let input;
  let parts;
  if (file_id) {
    const stored = inputs.get(file_id);
    if (!stored) return res.status(404).json({ error: 'File đã hết hạn, vui lòng tải lại.' });
    input = stored.input;
    parts = Array.isArray(lessons) && lessons.length ? stored.parts.filter((p) => lessons.includes(p.so)) : stored.parts;
  } else {
    if (!opts.ten_bai || !opts.mon_hoc) return res.status(400).json({ error: 'Soạn mới cần ít nhất Môn học và Tên bài.' });
    input = { kind: 'none', text: '' };
    parts = [{ so: 1, tieu_de: opts.ten_bai, text: '' }];
  }
  if (!parts.length) return res.status(400).json({ error: 'Chưa chọn tiết nào.' });
  const userKey = String(req.get('x-claude-key') || '').trim();
  const jobConfig = userKey ? { ...config, _apiKey: userKey } : config;
  if (!userKey && !serverKeyAvailable() && input.kind === 'none') {
    return res.status(400).json({ error: 'Chưa có khoá API Claude — nhập khoá ở mục Cài đặt để soạn mới.' });
  }
  const cleanOpts = {
    truong: config.truong,
    to_chuyen_mon: String(opts.to_chuyen_mon || config.to_chuyen_mon_mac_dinh || ''),
    giao_vien: String(opts.giao_vien || ''),
    mon_hoc: String(opts.mon_hoc || ''),
    lop: String(opts.lop || ''),
    ten_bai: parts.length === 1 ? String(opts.ten_bai || '') : '',
    bo_sach: String(opts.bo_sach || 'Kết nối tri thức với cuộc sống'),
    so_tiet: Math.max(1, Math.min(6, Number(opts.so_tiet) || 1)),
    tiet_ppct: String(opts.tiet_ppct || ''),
    tuan: String(opts.tuan || ''),
    phuong_phap: ['AUTO', 'THUONG', 'CT', 'LA', 'CA', 'SD'].includes(opts.phuong_phap) ? opts.phuong_phap : 'AUTO',
    su_dung_ai: Boolean(opts.su_dung_ai),
    ngon_ngu: String(opts.ngon_ngu || 'Tiếng Việt'),
    tra_cuu: opts.tra_cuu !== false,
    yeu_cau_them: String(opts.yeu_cau_them || '').slice(0, 2000),
  };
  const job = new Job();
  jobs.set(job.id, job);
  job.status = 'running';
  runJob(job, { parts, input, opts: cleanOpts, mode: mode === 'tham_dinh' ? 'tham_dinh' : 'nang_cap', config: jobConfig })
    .then((result) => {
      job.result = result;
      job.status = 'done';
      job.emit({ type: 'done', tom_tat: result.tom_tat, files: Object.keys(result.files) });
    })
    .catch((err) => {
      job.status = 'error';
      console.error(err.message || err);
      const msg = err?.status === 401 ? 'Khoá API Claude không hợp lệ — kiểm tra lại ở mục Cài đặt.' : err?.status === 429 ? 'Vượt giới hạn tốc độ của khoá API — thử lại sau ít phút.' : err.message || String(err);
      job.emit({ type: 'error', msg });
    });
  res.json({ job_id: job.id });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  job.events.forEach(send);
  if (job.status === 'done' || job.status === 'error') return res.end();
  const onEv = (e) => {
    send(e);
    if (e.type === 'done' || e.type === 'error') res.end();
  };
  job.on('ev', onEv);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    job.off('ev', onEv);
  });
});

app.get('/api/jobs/:id/files/:name', (req, res) => {
  const job = jobs.get(req.params.id);
  const buf = job?.result?.files?.[req.params.name];
  if (!buf) return res.status(404).json({ error: 'Không tìm thấy file.' });
  const type = req.params.name.endsWith('.json') ? 'application/json' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${req.params.name}"` });
  res.send(buf);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`KHBD Việt Anh đang chạy: http://localhost:${port}`);
  console.log(serverKeyAvailable() ? `AI: dùng khoá của máy chủ (${config.model})` : 'AI: chưa có khoá máy chủ — mỗi người nhập khoá API Claude của mình ở mục Cài đặt trên web.');
});
