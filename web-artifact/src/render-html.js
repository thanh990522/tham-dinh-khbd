// Bản HTML của KHBD (cùng bố cục với file Word) — để xem trước trên trang và sao chép dán vào Word.
// Dùng style nội tuyến vì khi dán, Word giữ style nội tuyến tốt nhất.
import { PHUONG_PHAP, THOI_QUEN, GIA_TRI } from '../../src/lib/schema.js';
import { evidence, activityTags } from '../../src/lib/active-learning.js';
import { isEnglishLesson, HEAD, KHUNG_TA, weekPeriod } from '../../src/lib/english.js';
import { PROC_LABELS, stageLines } from '../../src/lib/render-docx.js';

const HL = 'background:#ffeb3b;color:#000;padding:0 2px;';

const F = "font-family:'Times New Roman',Times,serif;font-size:13pt;line-height:1.4;color:#000;";
const TD = 'border:1px solid #808080;padding:4px 6px;vertical-align:top;font-size:12pt;';
const TH = `${TD}background:#d9e2f3;font-weight:bold;text-align:center;`;
const HINH_THUC = { ca_nhan: 'Cá nhân', cap_doi: 'Cặp đôi', nhom: 'Nhóm', ca_lop: 'Cả lớp' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function renderKHBDHtml(list, config, { images = [], refs = [] } = {}) {
  const IMG = new Map(images.map((im) => [im.n, im]));
  const imgTag = (n) => {
    const im = IMG.get(n);
    if (!im) return `<i>(hình ${n} trong giáo án gốc)</i>`;
    const w = Math.min(110, im.width);
    const h = Math.round((im.height * w) / im.width);
    const mime = im.type === 'jpg' ? 'image/jpeg' : `image/${im.type}`;
    return `<img src="data:${mime};base64,${toB64(im.data)}" width="${w}" height="${h}" alt="Hình ${n}">`;
  };
  // văn bản có thể chứa [HÌNH n] và xuống dòng
  const t = (s) => esc(s).replace(/\[HÌNH (\d+)\]/g, (_, n) => imgTag(Number(n))).replace(/\n/g, '<br>');
  const p = (html, st = '') => `<p style="${F}margin:3pt 0;${st}">${html}</p>`;
  const h = (text, lv = 1) => p(`<b>${esc(text)}</b>`, `font-size:${lv === 1 ? 14 : 13}pt;margin-top:${lv === 1 ? 12 : 8}pt;`);
  const lb = (label, html) => p(`<b>${esc(label)}</b>${html}`);
  const li = (html) => p(`– ${html}`, 'margin-left:14pt;');
  const table = (head, rows, widths) => `<table style="border-collapse:collapse;width:100%;margin:4pt 0;">${widths ? `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>` : ''}<tr>${head.map((c) => `<th style="${TH}${F}font-size:12pt;">${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td style="${TD}${F}font-size:12pt;">${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const lienKet = (a) => [...new Set([...a.muc_tieu_ids, ...a.tlim_ids, ...a.gia_tri_ids, ...a.trao_quyen_ids])].join(', ');

  const one = (k, idx) => {
    const m = k.meta;
    const mt = k.muc_tieu;
    const is4PP = m.phuong_phap !== 'THUONG';
    const en = isEnglishLesson(k);
    const H = HEAD[en ? 'en' : 'vi'];
    const ta = k.tieng_anh || { phan_tich_ngon_ngu: [], board_plan: [] };
    const out = [];
    out.push(`<table style="border-collapse:collapse;width:100%;"><tr><td style="${F}text-align:center;width:50%;"><b>${esc((m.truong || config.truong).toUpperCase())}</b><br>${esc(m.to_chuyen_mon ? `TỔ: ${m.to_chuyen_mon.toUpperCase()}` : 'TỔ CHUYÊN MÔN: ……………')}<br><i>${esc(config.khau_hieu)}</i></td><td style="${F}text-align:center;"><b>${esc(en ? `${H.mon} – ${H.lop} ${m.lop}` : `Môn: ${m.mon_hoc} – Lớp ${m.lop}`)}</b><br>${en ? `<b>${esc(weekPeriod(m, en))}</b>` : esc(weekPeriod(m, en))}<br>${en ? H.giaoVien : 'Giáo viên'}: ${esc(m.giao_vien || '……………………')}</td></tr></table>`);
    out.push(p(`<b>${esc(H.title)}</b>`, 'text-align:center;font-size:16pt;margin-top:12pt;'));
    out.push(p(`<b>${esc(m.ten_bai)}</b>`, 'text-align:center;font-size:14pt;'));
    if (en && (ta.loai_tiet || ta.khung)) out.push(p(`<b>${H.loaiTiet}:</b> ${esc(ta.loai_tiet || '—')} · <b>${H.khung}:</b> ${esc(KHUNG_TA[ta.khung] || '—')}`, 'text-align:center;'));
    out.push(p(`${esc(m.so_tiet)} tiết · <b>Phương pháp:</b> ${esc(PHUONG_PHAP[m.phuong_phap] || m.phuong_phap)} · <i>${m.su_dung_ai ? 'Có sử dụng AI' : 'Không sử dụng AI'}</i>`, 'text-align:center;margin-bottom:8pt;'));

    const items = (arr) => arr.map((x) => li(`<b>[${esc(x.id)}]</b> ${t(x.noi_dung)}`)).join('');
    out.push(h(H.mucTieu), h(H.kienThuc, 2), items(mt.kien_thuc), h(H.nangLuc, 2), p(`<b><i>${esc(H.nlChung)}</i></b>`), items(mt.nang_luc_chung), p(`<b><i>${esc(H.nlDacThu)}</i></b>`), items(mt.nang_luc_dac_thu), h(H.phamChat, 2), items(mt.pham_chat));
    let num = 3;
    if (is4PP || mt.tlim.length || mt.gia_tri_cot_loi.length) {
      out.push(h(`${++num}. TLIM & Giá trị cốt lõi`, 2));
      mt.tlim.forEach((x) => out.push(li(`<b>[${esc(x.id)}] Thói quen ${esc(x.thoi_quen_so)} – ${esc(x.ten_thoi_quen || THOI_QUEN[x.thoi_quen_so])}</b> · Công cụ: ${t(x.cong_cu)} · Biểu hiện: ${t(x.hanh_vi_quan_sat)}`)));
      mt.gia_tri_cot_loi.forEach((x) => out.push(li(`<b>[${esc(x.id)}] Giá trị ${esc(x.gia_tri_so)} – ${esc(x.ten_gia_tri || GIA_TRI[x.gia_tri_so])}</b> · Biểu hiện: ${t(x.hanh_vi_quan_sat)}`)));
    }
    if (is4PP || mt.trao_quyen.length) {
      out.push(h(`${++num}. Trao quyền`, 2));
      mt.trao_quyen.forEach((x) => out.push(li(`<b>[${esc(x.id)}]</b> ${t(x.noi_dung)}`)));
    }
    out.push(h(`${++num}. Active Learning`, 2), items(mt.active_learning || []));
    out.push(p(`<b style="${HL}">Minh chứng trong tiến trình</b>`, 'margin-left:14pt;'));
    evidence(k).forEach((e) => out.push(p(`<b style="color:${e.ok ? '#2e7d32' : '#c00000'}">${e.ok ? '✓' : '✗'}</b> ${esc(e.text)}`, 'margin-left:28pt;font-size:12pt;')));

    const tb = (ai) => k.thiet_bi_hoc_lieu.filter((x) => x.doi_tuong === ai).map((x) => `${t(x.ten)}${x.dung_cho_hoat_dong.length ? ` (${esc(x.dung_cho_hoat_dong.join(', '))})` : ''}`).join('; ');
    out.push(h(H.thietBi), ...['GV', 'HS'].filter((ai) => tb(ai)).map((ai) => lb(ai === 'GV' ? H.gv : H.hs, tb(ai))));
    if (en) {
      if (ta.trong_tam) out.push(lb(H.trongTam, t(ta.trong_tam)));
      if (ta.phan_tich_ngon_ngu.length) out.push(h(H.ngonNgu, 2), table(H.ngonNguHead, ta.phan_tich_ngon_ngu.map((x) => [t(x.form), t(x.pronunciation), t(x.meaning), t(x.vietnamese)]), [29, 22, 27, 22]));
      if (ta.board_plan.length) out.push(h(H.bang, 2), `<table style="border-collapse:collapse;width:100%;margin:4pt 0;"><tr><td style="${TD}${F}font-size:12pt;">${ta.board_plan.map((l) => t(l)).join('<br>')}</td></tr></table>`);
    }

    const ai = k.ung_dung_ai;
    if (m.su_dung_ai) {
      out.push(h('Ứng dụng AI', 2));
      if (ai.giao_vien.length) out.push(table(['Khâu (phía GV)', 'Công cụ', 'Cách kiểm chứng'], ai.giao_vien.map((g) => [t(g.khau), t(g.cong_cu), t(g.cach_kiem_chung)]), [36, 22, 42]));
      out.push(lb('Học sinh được dùng AI: ', ai.hoc_sinh_duoc_dung ? 'Có' : 'Không'));
      if (ai.hoc_sinh_duoc_dung) out.push(lb('Nhiệm vụ được dùng: ', t(ai.nhiem_vu_hs_duoc_dung.join('; '))), lb('Giới hạn: ', t(ai.gioi_han)), lb('Khâu bắt buộc tự làm: ', t(ai.khau_bat_buoc_tu_lam.join('; '))), lb('Lưu dấu vết: ', t(ai.luu_dau_vet)));
      out.push(lb('Đánh giá phân biệt tư duy HS với phần AI: ', t(ai.danh_gia_phan_biet)));
    }

    const d = k.dac_thu_phuong_phap;
    if (m.phuong_phap === 'CT') {
      const r = d.praad;
      out.push(h('Quy trình PRAAD (Critical Thinking)', 2), table(['Bước', 'Nội dung thiết kế'], [
        ['P – Mục đích', t(`${r.muc_dich_loai.replace(/_/g, ' ')}: ${r.muc_dich}`)],
        ['R – Tiêu chí', r.tieu_chi.map((x) => `• ${t(x)}`).join('<br>')],
        ['A – Giả định', r.gia_dinh.map((x) => `• ${t(x)}`).join('<br>')],
        ['A – Phân tích', [...r.khia_canh.map((x) => `• Khía cạnh: ${t(x)}`), ...r.gia_thuyet_minh_chung.map((x) => `• ${t(x)}`), `• Độ tin cậy nguồn: ${t(r.do_tin_cay_nguon)}`].join('<br>')],
        ['D – Quyết định', t(r.quyet_dinh)],
      ], [20, 80]));
    }
    if (m.phuong_phap === 'LA') {
      out.push(h('Các cấp độ LikeAbility (chia sẻ mục tiêu với HS ngay đầu bài)', 2));
      d.cap_do_likeability.forEach((c) => {
        out.push(lb(`${c.ten} (Bloom: ${c.muc_bloom}) — `, `Mục tiêu: ${t(c.muc_tieu)}`));
        c.nhiem_vu.forEach((n, i) => out.push(li(`Nhiệm vụ ${i + 1}: ${t(n.hoi)} → Lời giải: ${t(n.goi_y_dap_an)}`)));
        out.push(p(`<b><i>Ngưỡng lên cấp:</i></b> <i>${t(c.nguong_len_cap)}</i>`, 'margin-left:14pt;'));
      });
    }
    if (m.phuong_phap === 'CA') {
      out.push(h('Chủ đề CrossAbility', 2));
      d.chu_de_crossability.forEach((c) => {
        out.push(lb('Chủ đề: ', t(c.ten)), p('<i>Câu hỏi dẫn dắt:</i>'), c.cau_hoi_dan_dat.map((q) => li(t(q))).join(''), p('<i>Câu hỏi chéo cho nhóm khác:</i>'), c.cau_hoi_cheo.map((q) => li(`${t(q.hoi)} → ${t(q.goi_y_dap_an)}`)).join(''));
      });
    }
    if (m.phuong_phap === 'SD') {
      out.push(h('Phương án Same / Different', 2), lb('Hình thức tổ chức: ', t(d.hinh_thuc_same_different)), table(['Phương án', 'Định hướng thực hiện', 'Tài liệu tham khảo'], d.phuong_an_same_different.map((x) => [t(x.ten), t(x.dinh_huong), t(x.tai_lieu)]), [24, 50, 26]), lb('Yêu cầu so sánh giống/khác: ', t(d.yeu_cau_so_sanh)));
    }

    const b = k.bo_cau_hoi_dinh_huong;
    out.push(h('BỘ CÂU HỎI ĐỊNH HƯỚNG'));
    b.nhom.forEach((n) => {
      out.push(p(`<b>${t(n.ten_nhom)}</b>`));
      n.cau_hoi.forEach((q, i) => out.push(li(`${i + 1}. ${t(q.hoi)}${q.goi_y_dap_an ? ` <i>→ ${t(q.goi_y_dap_an)}</i>` : ''}`)));
    });

    out.push(h('RUBRIC ĐÁNH GIÁ (công bố cho HS đầu tiết)'));
    k.rubric.forEach((r) => {
      out.push(p(`<b>[${esc(r.id)}] ${t(r.ten)}</b>${r.ap_dung_cho.length ? ` <i>(${esc(r.ap_dung_cho.join(', '))})</i>` : ''}`));
      out.push(table(['Tiêu chí', 'Tốt', 'Đạt', 'Chưa đạt'], r.tieu_chi.map((x) => [`${t(x.ten)}${x.lien_ket_muc_tieu.length ? ` (${esc(x.lien_ket_muc_tieu.join(', '))})` : ''}`, t(x.tot), t(x.dat), t(x.chua_dat)]), [22, 26, 26, 26]));
    });

    const L = PROC_LABELS[en ? 'en' : 'vi'];
    const proc = (a) => {
      const c = a.to_chuc;
      const tags = activityTags(a);
      const x = [tags.length ? p(`<b style="${HL}">Active Learning:</b> <i>${esc(tags.join(' · '))}</i>`, 'font-size:11pt;') : '', lb(L.content, t(a.noi_dung))];
      [['*', c.giao_nhiem_vu], ['**', c.thuc_hien_nhiem_vu], ['***', c.bao_cao_thao_luan], ['****', c.ket_luan_nhan_dinh]].forEach(([mk, v]) => { if (v) x.push(p(`<b>${mk}</b> ${t(v)}`)); });
      x.push(lb(L.product, t(a.san_pham)));
      if (a.phan_vai.length) x.push(lb(L.roles, t(a.phan_vai.map((v) => `${v.vai}: ${v.nhiem_vu}`).join('; '))));
      if (a.kiem_tra_hieu_bai.co) x.push(lb(L.check, t(`${a.kiem_tra_hieu_bai.cong_cu}${a.kiem_tra_hieu_bai.cach_dieu_chinh ? ` → ${a.kiem_tra_hieu_bai.cach_dieu_chinh}` : ''}`)));
      if (a.ho_tro_hs) x.push(lb(L.support, t(a.ho_tro_hs)));
      if (a.dung_ai) x.push(lb(L.ai, t(a.dung_ai)));
      if (a.rubric_ids.length) x.push(p(`<i>${esc(L.rubric)}${esc(a.rubric_ids.join(', '))}</i>`, 'font-size:11pt;'));
      if (a.cau_hoi_chiem_nghiem.length) x.push(p(`<b>${esc(L.reflect)}</b>`), a.cau_hoi_chiem_nghiem.map((q) => li(`${t(q.hoi)}${q.cham_vao_ids.length ? ` (${esc(q.cham_vao_ids.join(', '))})` : ''}`)).join(''));
      return x.join('');
    };
    out.push(h(H.tienTrinh), p(`<i>${esc(L.legend)}</i>`, 'font-size:11pt;'));
    const stageCell = (a) => {
      const st = stageLines(a, k);
      return `${st.stage ? p(`<b style="color:#1f3864">${esc(st.stage)}</b>`) : ''}${p(st.stage ? t(st.ten) : `<b>${t(st.ten)}</b>`)}${p(`<i>${esc(st.buoc)}</i>`, 'font-size:11pt;')}`;
    };
    out.push(table(L.head, k.hoat_dong.map((a) => [
      stageCell(a),
      `${p(t(a.muc_tieu_hoat_dong))}${p(`<i>(${esc(lienKet(a))})</i>`, 'font-size:11pt;')}`,
      proc(a),
      p(esc(L.inter[a.hinh_thuc] || ''), 'text-align:center;'),
      p(`<b>${esc(a.thoi_gian_phut)} ${esc(L.min)}</b>`, 'text-align:center;'),
    ]), [15, 16, 51, 10, 8]));

    if (k.du_kien_kho_khan.length) {
      out.push(h(H.khoKhan));
      out.push(en ? table(H.khoKhanHead, k.du_kien_kho_khan.map((x) => [t(x.kho_khan), t(x.giai_phap)]), [50, 50]) : k.du_kien_kho_khan.map((x) => li(`${t(x.kho_khan)} → ${t(x.giai_phap)}`)).join(''));
    }
    if (k.huong_dan_ve_nha) out.push(h(H.veNha), p(t(k.huong_dan_ve_nha)));
    const cc = k.can_cu_chuong_trinh;
    out.push(h('PHỤ LỤC – YÊU CẦU CẦN ĐẠT (CHƯƠNG TRÌNH GDPT 2018)'), cc.yeu_cau_can_dat.map((y) => li(t(y))).join(''));
    const used = new Set([...JSON.stringify(k).matchAll(/\[HÌNH (\d+)\]/g)].map((x) => Number(x[1])));
    const left = (refs[idx] || []).filter((n) => !used.has(n) && IMG.has(n));
    if (left.length) out.push(h('PHỤ LỤC – HÌNH ẢNH TỪ GIÁO ÁN GỐC'), left.map((n) => p(`<b>Hình ${n}:</b> ${imgTag(n)}`)).join(''));
    return out.join('');
  };

  return `<div style="${F}">${list.map((k, i) => one(k, i)).join('<br style="page-break-before:always">')}</div>`;
}
