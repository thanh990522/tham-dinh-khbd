// Điều phối một "job": nhận file/thông tin → (tra cứu) → soạn/nâng cấp → vòng kiểm tra–chấm–tự sửa → xuất file.
import { preAudit, imageRefs } from './parse-input.js';
import { validateKHBD, tongHopDiem } from './validator.js';
import * as realAI from './ai.js';
import { fillBySchema } from './ai.js';
import { KHBD_SCHEMA } from './schema.js';
import { renderKHBDDocx, renderReportDocx } from './render-docx.js';

const datYeuCau = (s, v, target) => !s.co_p1 && s.diem_100 >= target && !v.issues.some((i) => i.muc_do === 'P1' || i.muc_do === 'P2');

// `deps` cho phép thay các hàm AI (dùng trong kiểm thử).
export async function runJob(job, { parts, input, opts, mode, config }, deps = {}) {
  const { research, generateKHBD, reviseKHBD, gradeKHBD, aiAvailable } = { ...realAI, ...deps };
  const log = (msg, extra = {}) => job.emit({ type: 'log', msg, ...extra });
  const results = [];
  const useAI = aiAvailable(config);
  const target = config.diem_muc_tieu;

  for (const [idx, part] of parts.entries()) {
    const nhan = parts.length > 1 ? `[${idx + 1}/${parts.length}] ${part.tieu_de}` : part.tieu_de || opts.ten_bai || 'KHBD';
    const partInput = input.kind === 'pdf' ? input : { kind: 'text', text: part.text };
    const pre = part.text ? preAudit(part.text, config.phut_moi_tiet * (opts.so_tiet || 1)) : null;
    if (pre) log(`${nhan}: rà soát sơ bộ bản gốc — thiếu ${pre.so_thieu}/${pre.items.length} thành phần, tổng thời gian ghi được ${pre.thoi_gian.tong} phút.`);

    // Trường hợp file JSON KHBD có sẵn (hoặc không có AI): chỉ kiểm tra + xuất
    if (part.khbd) {
      const khbd = fillBySchema(part.khbd, KHBD_SCHEMA);
      const v = validateKHBD(khbd, { config });
      const s = tongHopDiem(v, null);
      log(`${nhan}: kiểm tra theo quy tắc — ${s.diem_tho}/${s.kha_tham_dinh} điểm khả thẩm định, ${v.issues.length} vấn đề.`);
      results.push({ part, pre, research: null, khbd, validation: v, grade: null, score: s, history: [{ vong: 0, ...s, so_loi: v.issues.length }] });
      continue;
    }
    if (!useAI) {
      results.push({ part, pre, research: null, khbd: null, validation: null, grade: null, score: null, history: [] });
      log(`${nhan}: chưa có khoá API Claude (nhập ở mục Cài đặt) — chỉ xuất báo cáo rà soát sơ bộ.`, { level: 'warn' });
      continue;
    }

    let researchResult = null;
    if (opts.tra_cuu && config.tra_cuu_web) {
      log(`${nhan}: tra cứu yêu cầu cần đạt và nội dung SGK trên web…`);
      try {
        researchResult = await research({ config, opts: { ...opts, ten_bai: opts.ten_bai || part.tieu_de }, input: partInput });
        log(`${nhan}: tra cứu xong (${researchResult.nguon.length} nguồn).`);
      } catch (err) {
        log(`${nhan}: tra cứu web lỗi (${err.message}) — tiếp tục, các chi tiết SGK sẽ được đánh dấu "GV kiểm tra lại".`, { level: 'warn' });
      }
    }

    const genMode = mode === 'tham_dinh' ? 'trich_xuat' : input.kind === 'none' ? 'soan_moi' : 'nang_cap';
    const tenViec = { trich_xuat: 'đọc và cấu trúc hoá bản gốc', soan_moi: 'soạn KHBD mới', nang_cap: 'nâng cấp KHBD' }[genMode];
    log(`${nhan}: ${tenViec} (có thể mất vài phút)…`);
    let chars = 0;
    const onText = (d) => {
      chars += d.length;
      if (chars % 4000 < d.length) job.emit({ type: 'progress', msg: `${nhan}: đang viết… ${Math.round(chars / 1000)}k ký tự` });
    };
    let khbd = await generateKHBD({ config, opts: { ...opts, ten_bai: opts.ten_bai || part.tieu_de }, input: partInput, researchResult, mode: genMode, onText });
    if (researchResult && genMode !== 'trich_xuat') {
      const ng = new Set([...khbd.can_cu_chuong_trinh.nguon_tham_khao, ...researchResult.nguon]);
      khbd.can_cu_chuong_trinh.nguon_tham_khao = [...ng];
    }

    const history = [];
    let v, g, s;
    const maxVong = mode === 'tham_dinh' ? 0 : config.so_vong_tu_sua_toi_da;
    for (let vong = 0; ; vong++) {
      v = validateKHBD(khbd, { config });
      log(`${nhan}: vòng ${vong} — bộ kiểm tra quy tắc: ${v.issues.filter((i) => i.muc_do === 'P1').length} P1, ${v.issues.filter((i) => i.muc_do === 'P2').length} P2, ${v.issues.filter((i) => i.muc_do === 'P3').length} P3.`);
      log(`${nhan}: vòng ${vong} — AI chấm chuyên môn (Bước 2/3, Bước 6)…`);
      g = await gradeKHBD({ config, khbd, validation: v, researchResult });
      s = tongHopDiem(v, g);
      history.push({ vong, ...s, so_loi: v.issues.length });
      log(`${nhan}: vòng ${vong} — ${s.diem_100}/100 · ${s.xep_loai} · ${s.ket_luan}`, { level: datYeuCau(s, v, target) ? 'ok' : 'info' });
      if (datYeuCau(s, v, target) || vong >= maxVong) break;
      log(`${nhan}: tự sửa vòng ${vong + 1}…`);
      khbd = await reviseKHBD({ config, opts, khbd, issues: v.issues, grade: g, input: partInput, onText });
    }
    results.push({ part, pre, research: researchResult, khbd, validation: v, grade: g, score: s, history });
  }

  log('Đang xuất file Word…');
  const files = {};
  const coKHBD = results.filter((r) => r.khbd);
  if (coKHBD.length && mode !== 'tham_dinh') {
    files['KHBD_hoan_chinh.docx'] = await renderKHBDDocx(coKHBD.map((r) => r.khbd), config, {
      images: input.images || [],
      refs: coKHBD.map((r) => imageRefs(r.part.text)),
    });
  }
  files['Bao_cao_tham_dinh.docx'] = await renderReportDocx(results, { config, mode });
  if (coKHBD.length) files['KHBD.json'] = Buffer.from(JSON.stringify(coKHBD.map((r) => r.khbd), null, 2), 'utf8');
  return {
    files,
    tom_tat: results.map((r) => ({
      tieu_de: r.part.tieu_de,
      diem: r.score?.diem_100 ?? null,
      day_du: r.score?.day_du ?? false,
      xep_loai: r.score?.xep_loai ?? null,
      ket_luan: r.score?.ket_luan ?? 'Chỉ rà soát sơ bộ',
      co_p1: r.score?.co_p1 ?? null,
      so_loi: r.validation?.issues.length ?? null,
      lich_su: r.history.map((h) => h.diem_100),
      pre_thieu: r.pre ? r.pre.items.filter((i) => !i.co).map((i) => i.ten) : [],
    })),
  };
}
