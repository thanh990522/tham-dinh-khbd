import { readFile, preAudit, upgradeLesson, buildDocx, errMsg } from './engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const S = { parts: [], images: [], fileName: '', sample: null, downloads: null, busy: false, ctl: null, blob: null };

// Các giai đoạn của một tiết: [khoá, nhãn, % bắt đầu, % kết thúc, số ký tự dự kiến]
const STAGES = [
  ['soan1', 'Mục tiêu & rubric', 0, 38, 18000],
  ['soan2', 'Tiến trình dạy học', 38, 76, 26000],
  ['cham', 'Chấm theo tiêu chí', 76, 90, 4000],
  ['sua', 'Tự sửa', 90, 97, 16000],
];

function setStep(n) {
  ['s1', 's2', 's3'].forEach((id, i) => {
    $(id).classList.toggle('done', i + 1 < n);
    $(id).classList.toggle('idle', i + 1 > n);
  });
}

const chosen = () => [...document.querySelectorAll('#lessons input:checked')].map((c) => Number(c.value));

function refresh() {
  let hint = '';
  if (!S.sample) hint = S.sample === null ? 'Claude chưa dùng được ở chế độ xem này — hãy mở trang trong claude.ai.' : 'Đang kết nối Claude…';
  else if (!S.parts.length) hint = 'Tải giáo án lên để bắt đầu.';
  else if (!chosen().length) hint = 'Chọn ít nhất một tiết.';
  else hint = `${chosen().length} tiết · khoảng ${chosen().length * 4}–${chosen().length * 8} phút`;
  $('run').disabled = S.busy || !S.sample || !S.parts.length || !chosen().length;
  $('runHint').textContent = S.busy ? '' : hint;
  if (S.parts.length && !S.busy) setStep(S.blob ? 4 : chosen().length ? 3 : 2);
}

// ───── Bước 1: đọc file ─────
async function onFile(file) {
  $('fileErr').hidden = true;
  $('fileRow').hidden = false;
  $('fileName').textContent = file.name;
  $('fileInfo').textContent = 'đang đọc…';
  try {
    const r = await readFile(file);
    S.parts = r.parts;
    S.images = r.images;
    S.fileName = file.name.replace(/\.[^.]+$/, '');
    $('fileInfo').textContent = `${r.parts.length} tiết${r.images.length ? ` · ${r.images.length} hình` : ''}`;
    renderLessons();
  } catch (e) {
    S.parts = [];
    $('fileRow').hidden = true;
    $('fileErr').textContent = e.message;
    $('fileErr').hidden = false;
    $('lessons').innerHTML = '<p class="hint">Danh sách tiết sẽ hiện ở đây sau khi tải file.</p>';
    setStep(1);
  }
  $('runBox').hidden = true;
  $('runBox').innerHTML = '';
  S.blob = null;
  $('run').textContent = 'Nâng cấp KHBD';
  $('run').className = 'btn primary';
  refresh();
}

function renderLessons() {
  const box = $('lessons');
  box.innerHTML = '';
  S.parts.forEach((p, i) => {
    const a = preAudit(p.text, 45);
    const thieu = a.items.filter((x) => !x.co);
    const p1 = thieu.filter((x) => x.p1).length;
    const row = document.createElement('label');
    row.className = 'lesson';
    row.innerHTML = `<input type="checkbox" value="${p.so}" ${i === 0 || S.parts.length <= 2 ? 'checked' : ''}>
      <span class="t">${esc(p.tieu_de)}</span>
      <span class="m">${thieu.length ? `<span class="tag">bản gốc thiếu ${thieu.length}/${a.items.length} thành phần</span>` : '<span class="tag ok">đủ thành phần chính</span>'}${p1 ? '<span class="tag red">thiếu Chiêm nghiệm</span>' : ''}${a.thoi_gian.tong ? `<span class="tag ${a.thoi_gian.khop ? 'ok' : ''}">${a.thoi_gian.tong}/45 phút</span>` : ''}</span>`;
    box.appendChild(row);
  });
  box.querySelectorAll('input').forEach((c) => c.addEventListener('change', refresh));
  $('selAll').hidden = S.parts.length < 3;
}

// ───── Bước 3: nâng cấp ─────
function opts() {
  const v = (id) => $(id).value.trim();
  return {
    truong: 'Trường Việt Anh', to_chuyen_mon: v('to_chuyen_mon'), giao_vien: v('giao_vien'), mon_hoc: v('mon_hoc'), lop: v('lop'),
    ten_bai: '', bo_sach: 'Kết nối tri thức với cuộc sống', so_tiet: 1, phuong_phap: v('phuong_phap'),
    su_dung_ai: $('su_dung_ai').checked, ngon_ngu: v('ngon_ngu'), yeu_cau_them: v('yeu_cau_them'),
  };
}

function jobRow(title) {
  const el = document.createElement('div');
  el.className = 'job';
  el.innerHTML = `<div class="job-h"><span>${esc(title)}</span><span class="pct">Đang chờ</span></div>
    <div class="bar"><i></i></div>
    <ul class="stages">${STAGES.map(([k, label]) => `<li data-k="${k}">${label}</li>`).join('')}</ul>`;
  return {
    el,
    stage(key, chars = 0) {
      const idx = STAGES.findIndex((s) => s[0] === key);
      const [, , from, to, expect] = STAGES[idx];
      const pct = Math.round(from + (to - from) * Math.min(0.95, chars / expect));
      el.querySelector('.bar i').style.width = `${pct}%`;
      el.querySelector('.pct').textContent = chars ? `${pct}%` : 'Claude đang suy nghĩ…';
      el.querySelectorAll('.stages li').forEach((li, i) => {
        li.className = i < idx ? 'ok' : i === idx ? 'now' : '';
      });
    },
    finish(text, ok = true) {
      el.querySelector('.bar i').style.width = '100%';
      el.querySelector('.pct').textContent = text;
      el.querySelectorAll('.stages li').forEach((li) => { li.className = ok ? 'ok' : ''; });
    },
  };
}

async function run() {
  const parts = S.parts.filter((p) => chosen().includes(p.so));
  S.busy = true;
  S.ctl = new AbortController();
  S.blob = null;
  refresh();
  const box = $('runBox');
  box.hidden = false;
  box.innerHTML = '';
  $('goRow').hidden = true;
  const stop = document.createElement('button');
  stop.className = 'btn quiet';
  stop.type = 'button';
  stop.textContent = 'Dừng';
  stop.addEventListener('click', () => S.ctl.abort());
  const rows = parts.map((p) => jobRow(p.tieu_de));
  rows.forEach((r) => box.appendChild(r.el));
  box.appendChild(stop);

  const results = [];
  let error = null;
  for (const [i, part] of parts.entries()) {
    try {
      const r = await upgradeLesson({ sample: S.sample, opts: opts(), part, signal: S.ctl.signal, stage: (k, n) => rows[i].stage(k, n) });
      results.push(r);
      rows[i].finish(`${r.score.diem_100}/100`);
    } catch (e) {
      error = e;
      rows[i].finish(e.code === 'cancelled' ? 'Đã dừng' : 'Lỗi', false);
      break;
    }
  }
  stop.remove();
  if (results.length) {
    S.blob = await buildDocx(results, S.images);
    box.appendChild(resultPanel(results, error));
  } else {
    const p = document.createElement('p');
    p.className = 'err';
    p.textContent = error?.code === 'cancelled' ? 'Đã dừng. Bấm Nâng cấp KHBD để chạy lại.' : errMsg(error);
    box.appendChild(p);
  }
  S.busy = false;
  $('goRow').hidden = false;
  $('run').textContent = results.length ? 'Nâng cấp lại' : 'Nâng cấp KHBD';
  $('run').className = results.length ? 'btn quiet' : 'btn primary';
  refresh();
}

function resultPanel(results, error) {
  const n = results.length;
  const avg = Math.round(results.reduce((s, r) => s + r.score.diem_100, 0) / n);
  const allPass = results.every((r) => !r.score.co_p1 && r.score.diem_100 >= 85);
  const kiemTra = results.reduce((s, r) => s + r.khbd.can_cu_chuong_trinh.ghi_chu_can_kiem_tra.length, 0);
  const conLai = results.flatMap((r) => [
    ...r.validation.issues.filter((x) => x.muc_do !== 'P3').map((x) => `${n > 1 ? `${r.khbd.meta.ten_bai || r.part.tieu_de}: ` : ''}${x.van_de}`),
  ]);
  const el = document.createElement('div');
  el.className = `result ${allPass ? '' : 'warn'}`;
  el.innerHTML = `<div class="result-top">
      <div class="score"><b>${avg}</b><small>/100</small></div>
      <div class="verdict"><strong>${allPass ? 'KHBD đã đạt chuẩn thẩm định' : 'KHBD đã nâng cấp — còn vài điểm cần thầy cô xem lại'}</strong>
        <span>${n} tiết · ${results.map((r) => `${r.score.xep_loai}`).join(', ')}${error ? ' · các tiết sau bị dừng giữa chừng' : ''}</span></div>
    </div>
    ${n === 1 ? breakdown(results[0]) : ''}
    <div class="go"><button class="btn primary" type="button" id="dl">Tải KHBD hoàn chỉnh (.docx)</button></div>
    ${kiemTra ? `<p class="note red">${kiemTra} chi tiết SGK cần thầy cô kiểm tra lại — đánh dấu đỏ ở phụ lục cuối file.</p>` : ''}
    ${conLai.length ? `<details class="left"><summary>${conLai.length} điểm chưa hoàn toàn đạt</summary><ul>${conLai.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
  el.querySelector('#dl').addEventListener('click', (ev) => save(ev.currentTarget));
  return el;
}

function breakdown(r) {
  const s = r.score;
  return `<dl class="rows">
    <div><dt>Khung mẫu</dt><dd>${s.buoc1}/15</dd></div>
    <div><dt>Yêu cầu cần đạt</dt><dd>${s.buoc23}/10</dd></div>
    <div><dt>Mục tiêu ↔ hoạt động</dt><dd>${s.buoc5}/20</dd></div>
    <div><dt>Tiêu chí chuyên môn</dt><dd>${s.buoc6.diem}/40</dd></div>
    <div><dt>Active Learning · Giá trị & Thói quen</dt><dd>${s.buoc7}/15</dd></div>
    <div><dt>Thời lượng học sinh hoạt động</dt><dd>${r.validation.thong_ke.ti_le_hs}%</dd></div>
  </dl>`;
}

async function save(btn) {
  if (!S.blob) return;
  if (!S.downloads) {
    btn.disabled = true;
    btn.textContent = 'Chế độ xem này không cho tải file';
    return;
  }
  try {
    await S.downloads.save({ filename: `KHBD_${S.fileName || 'hoan_chinh'}.docx`, data: S.blob });
  } catch (e) {
    if (e?.code === 'declined' || e?.code === 'rate_limited') return;
    btn.disabled = true;
    btn.textContent = 'Không tải được ở chế độ xem này';
  }
}

// ───── khởi động ─────
$('file').addEventListener('change', (e) => e.target.files[0] && onFile(e.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]));
$('selAll').addEventListener('click', () => {
  const boxes = [...document.querySelectorAll('#lessons input')];
  const all = boxes.every((b) => b.checked);
  boxes.forEach((b) => { b.checked = !all; });
  refresh();
});
$('run').addEventListener('click', run);
S.sample = undefined;
refresh();

(async () => {
  const use = (n) => (window.claude?.use ? window.claude.use(n) : Promise.resolve(null));
  [S.sample, S.downloads] = await Promise.all([use('sample'), use('downloads')]);
  refresh();
})();
