'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { mode: 'nang_cap', fileId: null, lessons: [], status: null, busy: false };

const MODE_HELP = {
  nang_cap: 'Tải giáo án hiện có (kể cả giáo án chưa đúng khung). Hệ thống giữ ngữ liệu, bài tập, đáp án của thầy/cô, tái cấu trúc và bổ sung để đạt toàn bộ tiêu chí, rồi tự chấm – tự sửa. Kết quả: file KHBD hoàn chỉnh + báo cáo thẩm định.',
  soan_moi: 'Không cần file: nhập môn, lớp, tên bài — hệ thống tra cứu yêu cầu cần đạt & nội dung SGK rồi soạn KHBD mới đạt chuẩn.',
  tham_dinh: 'Chấm bản gốc đúng như giáo viên nộp (không sửa) theo bảng điểm /100, mã lỗi P1/P2/P3 — dùng cho TTCM.',
};

function code() { return $('accessCode').value.trim(); }
function headers(extra = {}) { return code() ? { ...extra, 'x-access-code': code() } : extra; }
function withCode(url) { return code() ? `${url}${url.includes('?') ? '&' : '?'}code=${encodeURIComponent(code())}` : url; }

async function loadStatus() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    state.status = s;
    const b = $('status');
    b.textContent = s.ai ? `AI sẵn sàng · ${s.model}` : 'AI chưa cấu hình (chỉ rà soát sơ bộ)';
    b.className = `badge ${s.ai ? 'ok' : 'bad'}`;
    $('target').textContent = s.diem_muc_tieu;
    $('rounds').textContent = s.so_vong;
    if (s.can_ma) $('codeBox').classList.remove('hidden');
    $('tqNote').textContent = '⚠ ' + (s.tieu_chi_trao_quyen?._GHI_CHU || '');
  } catch {
    $('status').textContent = 'Không kết nối được máy chủ';
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  $('modeHelp').textContent = MODE_HELP[mode];
  $('uploadCard').classList.toggle('hidden', mode === 'soan_moi');
  $('infoTitle').textContent = mode === 'soan_moi' ? '1. Thông tin bài dạy' : '2. Thông tin bài dạy (bổ sung nếu file chưa ghi)';
  $('run').textContent = mode === 'tham_dinh' ? 'Thẩm định bản gốc' : mode === 'soan_moi' ? 'Soạn KHBD mới' : 'Tạo KHBD hoàn chỉnh';
  refreshRun();
}

function refreshRun() {
  let ok = !state.busy;
  let hint = '';
  if (state.mode === 'soan_moi') {
    ok = ok && $('mon_hoc').value.trim() && $('ten_bai').value.trim();
    if (!$('mon_hoc').value.trim() || !$('ten_bai').value.trim()) hint = 'Cần nhập Môn học và Tên bài.';
  } else {
    const chosen = selectedLessons();
    ok = ok && state.fileId && chosen.length > 0;
    if (!state.fileId) hint = 'Hãy tải file lên trước.';
    else if (!chosen.length) hint = 'Chọn ít nhất 1 tiết.';
  }
  $('run').disabled = !ok;
  $('runHint').textContent = state.busy ? 'Đang xử lý…' : hint;
}

function selectedLessons() {
  return [...document.querySelectorAll('.lesson input[type=checkbox]:checked')].map((c) => Number(c.value));
}

async function analyze(file) {
  $('fileName').textContent = `${file.name} — đang đọc…`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('so_tiet', $('so_tiet').value || '1');
  const r = await fetch('/api/analyze', { method: 'POST', body: fd, headers: headers() });
  const data = await r.json();
  if (!r.ok) {
    $('fileName').textContent = `Lỗi: ${data.error}`;
    state.fileId = null;
    refreshRun();
    return;
  }
  state.fileId = data.file_id;
  state.lessons = data.lessons;
  $('fileName').textContent = `${data.filename} — tìm thấy ${data.lessons.length} tiết/bài`;
  renderLessons(data);
  refreshRun();
}

function renderLessons(data) {
  const box = $('lessons');
  box.innerHTML = '';
  if (data.lessons.length > 1) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'File có nhiều tiết — chọn các tiết cần xử lý (mỗi tiết được soạn và chấm riêng, gộp chung 1 file Word). ';
    const all = document.createElement('a');
    all.href = '#';
    all.textContent = 'Chọn / bỏ chọn tất cả';
    all.addEventListener('click', (e) => {
      e.preventDefault();
      const boxes = [...box.querySelectorAll('.lesson input[type=checkbox]')];
      const target = !boxes.every((c) => c.checked);
      boxes.forEach((c) => (c.checked = target));
      refreshRun();
    });
    p.appendChild(all);
    box.appendChild(p);
  }
  for (const l of data.lessons) {
    const d = document.createElement('div');
    d.className = 'lesson';
    const pre = l.pre;
    const coRoi = pre ? pre.items.filter((i) => i.co) : [];
    const chips = pre
      ? `<span class="chip ok" title="${esc(coRoi.map((i) => i.ten).join('; '))}">✓ đã có ${coRoi.length} mục</span>` +
        pre.items.filter((i) => !i.co).map((i) => `<span class="chip" title="${esc(i.buoc)}">✗ ${esc(i.ten)}</span>`).join('') +
        `<span class="chip ${pre.thoi_gian.khop ? 'ok' : ''}">⏱ ${pre.thoi_gian.tong}/${pre.thoi_gian.chuan} phút</span>`
      : l.la_json ? '<span class="chip ok">KHBD dạng JSON — kiểm tra & xuất Word trực tiếp</span>' : '<span class="chip ok">PDF — AI sẽ đọc trực tiếp</span>';
    d.innerHTML = `<label class="lesson-h"><input type="checkbox" value="${l.so}" ${data.lessons.length <= 3 || l.so === data.lessons[0].so ? 'checked' : ''}> ${esc(l.tieu_de)}</label>
      ${pre ? `<div class="muted" style="font-size:13px">Rà soát sơ bộ bản gốc: thiếu ${pre.so_thieu}/${pre.items.length} thành phần</div>` : ''}
      <div class="chips">${chips}</div>`;
    box.appendChild(d);
  }
  box.querySelectorAll('input').forEach((i) => i.addEventListener('change', refreshRun));
}

function opts() {
  const v = (id) => $(id).value.trim();
  return {
    mon_hoc: v('mon_hoc'), lop: v('lop'), ten_bai: v('ten_bai'), bo_sach: v('bo_sach'), so_tiet: Number(v('so_tiet')) || 1,
    tiet_ppct: v('tiet_ppct'), tuan: v('tuan'), to_chuyen_mon: v('to_chuyen_mon'), giao_vien: v('giao_vien'),
    phuong_phap: v('phuong_phap'), ngon_ngu: v('ngon_ngu'), su_dung_ai: $('su_dung_ai').checked, tra_cuu: $('tra_cuu').checked,
    yeu_cau_them: v('yeu_cau_them'),
  };
}

function addLog(msg, cls = '') {
  const log = $('log');
  if (cls === 'progress') {
    let last = log.querySelector('li.progress');
    if (!last) { last = document.createElement('li'); last.className = 'progress'; log.appendChild(last); }
    last.textContent = msg;
  } else {
    log.querySelector('li.progress')?.remove();
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = msg;
    log.appendChild(li);
  }
  log.scrollTop = log.scrollHeight;
}

async function run() {
  state.busy = true;
  refreshRun();
  $('progressCard').classList.remove('hidden');
  $('log').innerHTML = '';
  $('results').innerHTML = '';
  const body = { opts: opts(), mode: state.mode === 'tham_dinh' ? 'tham_dinh' : 'nang_cap' };
  if (state.mode !== 'soan_moi') { body.file_id = state.fileId; body.lessons = selectedLessons(); }
  const r = await fetch('/api/jobs', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) { addLog(data.error, 'error'); state.busy = false; refreshRun(); return; }
  addLog('Đã nhận yêu cầu. Mỗi tiết thường mất 3–8 phút (tra cứu → soạn → chấm → tự sửa).');
  const es = new EventSource(withCode(`/api/jobs/${data.job_id}/events`));
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'log') addLog(e.msg, e.level || '');
    else if (e.type === 'progress') addLog(e.msg, 'progress');
    else if (e.type === 'done') { es.close(); showResults(data.job_id, e); done(); }
    else if (e.type === 'error') { es.close(); addLog(`Lỗi: ${e.msg}`, 'error'); done(); }
  };
  es.onerror = () => { if (state.busy) { es.close(); addLog('Mất kết nối tới máy chủ.', 'error'); done(); } };
}

function done() { state.busy = false; refreshRun(); }

function showResults(jobId, e) {
  const box = $('results');
  for (const t of e.tom_tat) {
    const d = document.createElement('div');
    d.className = 'res';
    const good = t.diem !== null && !t.co_p1 && t.diem >= 70 && t.day_du;
    d.innerHTML = `<div><b>${esc(t.tieu_de)}</b></div>
      ${t.diem !== null ? `<div class="score">${t.diem}/100 <span style="font-size:16px">· ${esc(t.xep_loai)}${t.day_du ? '' : ' (tham khảo)'}</span></div>` : ''}
      <div class="verdict ${good ? 'ok' : 'bad'}">${esc(t.ket_luan)}</div>
      ${t.lich_su.length > 1 ? `<div class="muted">Điểm qua các vòng tự sửa: ${t.lich_su.map(esc).join(' → ')}</div>` : ''}
      ${t.so_loi !== null ? `<div class="muted">Vấn đề còn lại (quy tắc): ${t.so_loi}</div>` : ''}
      ${t.pre_thieu.length ? `<div class="muted">Bản gốc thiếu: ${t.pre_thieu.map(esc).join('; ')}</div>` : ''}`;
    box.appendChild(d);
  }
  const dl = document.createElement('div');
  dl.className = 'dl';
  const label = { 'KHBD_hoan_chinh.docx': '⬇ KHBD hoàn chỉnh (.docx)', 'Bao_cao_tham_dinh.docx': '⬇ Báo cáo thẩm định (.docx)', 'KHBD.json': 'Dữ liệu JSON' };
  for (const f of e.files) {
    const a = document.createElement('a');
    a.href = withCode(`/api/jobs/${jobId}/files/${encodeURIComponent(f)}`);
    a.textContent = label[f] || f;
    if (f.endsWith('.json')) a.className = 'sec';
    dl.appendChild(a);
  }
  box.appendChild(dl);
}

// ── sự kiện ──
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('file').addEventListener('change', (e) => e.target.files[0] && analyze(e.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]));
['mon_hoc', 'ten_bai'].forEach((id) => $(id).addEventListener('input', refreshRun));
$('run').addEventListener('click', run);
setMode('nang_cap');
loadStatus();
