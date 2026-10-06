import { readFile, preAudit, runLesson, toDocx, makeConfig, errMsg } from './engine.js';
import sampleKHBD from '../../samples/TA7_Unit2_Lesson1.khbd.json';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
};
const S = { mode: 'nang_cap', file: null, parts: [], images: [], sample: null, downloads: null, busy: false, ctl: null };

const MODE_HELP = {
  nang_cap: 'Tải giáo án hiện có. Claude giữ ngữ liệu, bài tập, đáp án và hình ảnh của thầy/cô, tái cấu trúc theo khung và bổ sung phần thiếu, rồi tự chấm – tự sửa đến khi đạt.',
  soan_moi: 'Không cần file: nhập môn, lớp, tên bài — Claude soạn KHBD mới đạt chuẩn.',
  tham_dinh: 'Chấm bản gốc đúng như giáo viên nộp (không sửa) theo bảng điểm /100 và mã lỗi P1/P2/P3.',
};

function settings() {
  return store.get('khbd_settings', { tieu_chi_trao_quyen: null, diem_muc_tieu: 88, so_vong: 2, to_chuyen_mon: '' });
}
function config() { return makeConfig(settings()); }

function log(msg, cls = '') {
  const box = $('log');
  if (!cls) {
    let live = box.querySelector('li.live');
    if (!live) { live = document.createElement('li'); live.className = 'live'; box.appendChild(live); }
    live.textContent = msg;
  } else {
    box.querySelector('li.live')?.remove();
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = msg;
    box.appendChild(li);
  }
  box.scrollTop = box.scrollHeight;
}

// ───── chế độ, form ─────
function setMode(m) {
  S.mode = m;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === m)));
  $('modeHelp').textContent = MODE_HELP[m];
  $('uploadBox').hidden = m === 'soan_moi';
  $('run').textContent = m === 'tham_dinh' ? 'Thẩm định bản gốc' : m === 'soan_moi' ? 'Soạn KHBD mới' : 'Tạo KHBD hoàn chỉnh';
  refresh();
}

function chosen() { return [...document.querySelectorAll('#lessons input:checked')].map((c) => Number(c.value)); }

function refresh() {
  let hint = '';
  let ok = !S.busy;
  if (!S.sample) { ok = false; hint = 'Claude chưa sẵn sàng ở chế độ xem này — mở trang trong claude.ai.'; }
  else if (S.mode === 'soan_moi') {
    if (!$('mon_hoc').value.trim() || !$('ten_bai').value.trim()) { ok = false; hint = 'Nhập Môn học và Tên bài.'; }
  } else if (!S.parts.length) { ok = false; hint = 'Tải giáo án lên trước.'; }
  else if (!chosen().length) { ok = false; hint = 'Chọn ít nhất 1 tiết.'; }
  $('run').disabled = !ok;
  $('stop').hidden = !S.busy;
  $('runHint').textContent = S.busy ? '' : hint;
}

function opts() {
  const v = (id) => $(id).value.trim();
  return {
    truong: 'Trường Việt Anh', to_chuyen_mon: v('to_chuyen_mon') || settings().to_chuyen_mon, giao_vien: v('giao_vien'), mon_hoc: v('mon_hoc'), lop: v('lop'),
    ten_bai: v('ten_bai'), bo_sach: v('bo_sach'), so_tiet: Number(v('so_tiet')) || 1, tiet_ppct: v('tiet_ppct'), tuan: v('tuan'),
    phuong_phap: v('phuong_phap'), su_dung_ai: $('su_dung_ai').checked, ngon_ngu: v('ngon_ngu'), yeu_cau_them: v('yeu_cau_them'),
  };
}

// ───── tải file ─────
async function onFile(file) {
  $('fileName').textContent = `${file.name} — đang đọc…`;
  try {
    const r = await readFile(file);
    S.parts = r.parts;
    S.images = r.images;
    $('fileName').textContent = `${file.name} — ${r.parts.length} tiết/bài${r.images.length ? `, ${r.images.length} hình` : ''}`;
    renderLessons();
  } catch (e) {
    S.parts = [];
    $('fileName').textContent = e.message;
    $('lessons').innerHTML = '';
  }
  refresh();
}

function renderLessons() {
  const box = $('lessons');
  box.innerHTML = '';
  const so = settings();
  S.parts.forEach((p, i) => {
    const pre = p.text ? preAudit(p.text, 45 * (Number($('so_tiet').value) || 1)) : null;
    const thieu = pre ? pre.items.filter((x) => !x.co) : [];
    const row = document.createElement('div');
    row.className = 'lesson';
    row.innerHTML = `<label class="lesson-h"><input type="checkbox" value="${p.so}" ${i === 0 ? 'checked' : ''}> <span>${esc(p.tieu_de)}</span></label>
      <div class="chips">${pre ? `<span class="chip ok">đã có ${pre.items.length - thieu.length}/${pre.items.length} mục</span>${thieu.map((x) => `<span class="chip ${x.p1 ? 'p1' : ''}">thiếu: ${esc(x.ten)}</span>`).join('')}<span class="chip ${pre.thoi_gian.khop ? 'ok' : ''}">${pre.thoi_gian.tong}/${pre.thoi_gian.chuan} phút</span>` : '<span class="chip ok">KHBD dạng JSON</span>'}</div>`;
    box.appendChild(row);
  });
  void so;
  box.querySelectorAll('input').forEach((c) => c.addEventListener('change', refresh));
}

// ───── chạy ─────
async function run() {
  S.busy = true;
  S.ctl = new AbortController();
  refresh();
  $('log').innerHTML = '';
  $('results').innerHTML = '';
  $('progress').hidden = false;
  const cfg = config();
  const o = opts();
  const mode = S.mode === 'soan_moi' ? 'soan_moi' : S.mode;
  const parts = S.mode === 'soan_moi' ? [{ so: 1, tieu_de: o.ten_bai, text: '' }] : S.parts.filter((p) => chosen().includes(p.so));
  const results = [];
  try {
    for (const [i, part] of parts.entries()) {
      const nhan = parts.length > 1 ? `[${i + 1}/${parts.length}] ${part.tieu_de}` : part.tieu_de;
      log(`${nhan}: bắt đầu (mỗi tiết thường 3–8 phút).`, 'step');
      const r = await runLesson({
        sample: S.sample, config: cfg, opts: { ...o, ten_bai: parts.length > 1 ? '' : o.ten_bai || part.tieu_de }, part,
        mode: mode === 'soan_moi' ? 'soan_moi' : mode === 'tham_dinh' ? 'trich_xuat' : 'nang_cap',
        signal: S.ctl.signal, log: (m, c) => log(`${nhan}: ${m}`, c),
      });
      results.push(r);
    }
    log('Đang tạo file Word…', 'step');
    const files = await toDocx(results, S.images, cfg, S.mode === 'tham_dinh' ? 'tham_dinh' : 'nang_cap');
    showResults(results, files);
    log('Xong.', 'ok');
  } catch (e) {
    log(e.code === 'cancelled' ? 'Đã dừng.' : `Lỗi: ${e.message || errMsg(e)}`, 'err');
    if (results.length) {
      const files = await toDocx(results, S.images, cfg, S.mode === 'tham_dinh' ? 'tham_dinh' : 'nang_cap');
      showResults(results, files);
    }
  } finally {
    S.busy = false;
    refresh();
  }
}

function showResults(results, files) {
  const box = $('results');
  box.innerHTML = '';
  for (const r of results) {
    const s = r.score;
    const good = !s.co_p1 && s.diem_100 >= 70 && s.day_du;
    const card = document.createElement('article');
    card.className = 'res';
    const b = r.validation.diem;
    card.innerHTML = `<div class="res-h"><h3>${esc(r.khbd.meta.ten_bai || r.part.tieu_de)}</h3><span class="pill ${good ? 'good' : s.co_p1 ? 'bad' : 'warn'}">${esc(s.xep_loai)}${s.day_du ? '' : ' (tham khảo)'}</span></div>
      <div class="score"><b>${s.diem_100}</b><span>/100</span></div>
      <p class="verdict ${good ? 'good' : 'bad'}">${esc(s.ket_luan)}</p>
      <dl class="parts">
        <div><dt>Khung mẫu</dt><dd>${s.buoc1}/15</dd></div>
        <div><dt>Yêu cầu cần đạt</dt><dd>${s.buoc23 ?? '—'}/10</dd></div>
        <div><dt>Nhất quán</dt><dd>${s.buoc5}/20</dd></div>
        <div><dt>Chuyên môn</dt><dd>${s.buoc6 ? s.buoc6.diem : '—'}/40</dd></div>
        <div><dt>Đặc thù VA</dt><dd>${s.buoc7}/15</dd></div>
        <div><dt>HS hoạt động</dt><dd>${b.buoc7.d1.ti_le_hs}%</dd></div>
      </dl>
      ${r.history.length > 1 ? `<p class="muted">Qua các vòng tự sửa: ${r.history.map((h) => h.diem_100).join(' → ')}</p>` : ''}
      ${r.validation.issues.length ? `<p class="muted">Còn ${r.validation.issues.length} vấn đề theo quy tắc — xem báo cáo.</p>` : ''}`;
    box.appendChild(card);
  }
  const dl = document.createElement('div');
  dl.className = 'dl';
  const label = { 'KHBD_hoan_chinh.docx': 'Tải KHBD hoàn chỉnh (.docx)', 'Bao_cao_tham_dinh.docx': 'Tải báo cáo thẩm định (.docx)', 'KHBD.json': 'Dữ liệu .json' };
  for (const [name, blob] of Object.entries(files)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = name.endsWith('.json') ? 'ghost' : 'primary';
    btn.textContent = label[name];
    btn.addEventListener('click', () => save(name, blob, btn));
    dl.appendChild(btn);
  }
  box.appendChild(dl);
}

async function save(name, blob, btn) {
  if (!S.downloads) { btn.textContent = 'Chế độ xem này không cho tải file'; btn.disabled = true; return; }
  try {
    await S.downloads.save({ filename: name, data: blob });
  } catch (e) {
    if (e?.code === 'declined') return;
    if (e?.code === 'rate_limited') { btn.title = 'Đang có hộp thoại lưu khác — thử lại sau giây lát.'; return; }
    btn.textContent = 'Không tải được ở chế độ xem này';
    btn.disabled = true;
  }
}

// ───── mẫu có sẵn (không tốn lượt Claude) ─────
async function showSample() {
  $('progress').hidden = false;
  $('log').innerHTML = '';
  log('Mẫu: TA7 Unit 2 – Lesson 1 (nâng cấp theo Same/Different). Phần chấm Claude chưa chạy trên mẫu này nên điểm là tham khảo từ bộ kiểm tra quy tắc.', 'step');
  const cfg = config();
  const r = await runLesson({ sample: null, config: cfg, opts: {}, part: { so: 1, tieu_de: sampleKHBD.meta.ten_bai, text: '', khbd: sampleKHBD }, mode: 'nang_cap', log: () => {} });
  showResults([r], await toDocx([r], [], cfg, 'nang_cap'));
}

// ───── cài đặt ─────
function loadSettings() {
  const s = settings();
  const def = makeConfig().tieu_chi_trao_quyen.danh_sach.map((x) => x.ten);
  const list = s.tieu_chi_trao_quyen || def;
  $('tq').innerHTML = list.map((t, i) => `<li><input id="tq${i}" value="${esc(t)}" aria-label="Tiêu chí ${i + 1}"></li>`).join('');
  $('tqState').textContent = s.tieu_chi_trao_quyen ? 'đang dùng danh sách bạn đã lưu' : 'danh sách TẠM (tài liệu nguồn chưa liệt kê 6 tiêu chí) — hãy thay bằng danh sách chính thức';
  $('tqState').className = s.tieu_chi_trao_quyen ? 'muted' : 'warn';
  $('cfgTarget').value = s.diem_muc_tieu;
  $('cfgRounds').value = s.so_vong;
  $('cfgTo').value = s.to_chuyen_mon || '';
  if (!$('to_chuyen_mon').value) $('to_chuyen_mon').value = s.to_chuyen_mon || '';
}
function saveSettings() {
  const tq = [0, 1, 2, 3, 4, 5].map((i) => $(`tq${i}`).value.trim());
  if (tq.some((x) => !x)) { $('cfgMsg').textContent = 'Cần đủ 6 tiêu chí.'; return; }
  const def = makeConfig().tieu_chi_trao_quyen.danh_sach.map((x) => x.ten);
  store.set('khbd_settings', {
    tieu_chi_trao_quyen: tq.join('|') === def.join('|') ? null : tq,
    diem_muc_tieu: Math.max(70, Math.min(100, Number($('cfgTarget').value) || 88)),
    so_vong: Math.max(0, Math.min(3, Number($('cfgRounds').value) || 0)),
    to_chuyen_mon: $('cfgTo').value.trim(),
  });
  $('cfgMsg').textContent = 'Đã lưu trên trình duyệt này.';
  loadSettings();
}

// ───── khởi động ─────
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('file').addEventListener('change', (e) => e.target.files[0] && onFile(e.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]));
['mon_hoc', 'ten_bai'].forEach((id) => $(id).addEventListener('input', refresh));
$('so_tiet').addEventListener('change', () => S.parts.length && renderLessons());
$('run').addEventListener('click', run);
$('stop').addEventListener('click', () => S.ctl?.abort());
$('saveCfg').addEventListener('click', saveSettings);
$('showSample').addEventListener('click', showSample);
loadSettings();
setMode('nang_cap');
showSample();

(async () => {
  const [sample, downloads] = await Promise.all([
    window.claude?.use?.('sample') ?? Promise.resolve(null),
    window.claude?.use?.('downloads') ?? Promise.resolve(null),
  ]);
  S.sample = sample;
  S.downloads = downloads;
  $('status').textContent = sample ? 'Claude sẵn sàng — dùng lượt Claude của chính bạn, hỏi xin phép ở lần chạy đầu' : 'Claude chưa dùng được ở chế độ xem này (cần mở trong claude.ai)';
  $('status').className = `status ${sample ? 'good' : 'bad'}`;
  refresh();
})();
