// Gọi Claude API: tra cứu (web search) → soạn/nâng cấp KHBD (structured output) → chấm chuyên môn.
import Anthropic from '@anthropic-ai/sdk';
import { KHBD_SCHEMA, GRADE_SCHEMA } from './schema.js';
import { buildSystemPrompt, buildMetaBlock } from './prompts.js';

let serverClient;
const userClients = new Map();
function getClient(config) {
  // Khoá do người dùng nhập trên web (config._apiKey) được ưu tiên; nếu không có thì dùng
  // ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / hồ sơ `ant auth login` của máy chủ.
  const opts = { maxRetries: 3, timeout: 20 * 60 * 1000 };
  if (config?._apiKey) {
    if (!userClients.has(config._apiKey)) userClients.set(config._apiKey, new Anthropic({ ...opts, apiKey: config._apiKey }));
    return userClients.get(config._apiKey);
  }
  if (!serverClient) serverClient = new Anthropic(opts);
  return serverClient;
}

export function serverKeyAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || process.env.AI_FORCE_ENABLE);
}

export function aiAvailable(config) {
  return Boolean(config?._apiKey) || serverKeyAvailable();
}

const useFallbacks = () => process.env.AI_FALLBACKS !== 'off';
let schemaFormatSupported = true;

export class AIError extends Error {}

// Gọi một lượt (có xử lý pause_turn của server tool), trả về message cuối.
async function callClaude({ config, system, content, effort, format, tools, maxTokens = 64000, onText }) {
  const messages = [{ role: 'user', content }];
  for (let turn = 0; turn < 6; turn++) {
    const params = {
      model: config.model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
      output_config: { effort, ...(format ? { format: { type: 'json_schema', schema: format } } : {}) },
      ...(tools ? { tools } : {}),
      ...(useFallbacks() ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };
    const stream = getClient(config).beta.messages.stream(params);
    if (onText) stream.on('text', (delta) => onText(delta));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') {
      throw new AIError(`Claude từ chối yêu cầu (${msg.stop_details?.category ?? 'không rõ'}). Hãy kiểm tra nội dung file.`);
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new AIError('Kết quả vượt giới hạn độ dài. Hãy tách file thành từng tiết nhỏ hơn rồi thử lại.');
    }
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    return msg;
  }
  throw new AIError('Quá nhiều lượt tạm dừng khi tra cứu web.');
}

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new AIError('Không đọc được JSON do AI trả về.');
  }
}

// Điền mặc định theo schema để dữ liệu luôn đủ trường (phòng khi phải dùng chế độ không ràng buộc schema).
export function fillBySchema(value, schema) {
  if (schema.type === 'object') {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const [k, s] of Object.entries(schema.properties)) out[k] = fillBySchema(v[k], s);
    return out;
  }
  if (schema.type === 'array') return Array.isArray(value) ? value.map((x) => fillBySchema(x, schema.items)) : [];
  if (schema.type === 'string') {
    if (schema.enum && !schema.enum.includes(value)) {
      return ['', 'khac'].find((d) => schema.enum.includes(d)) ?? schema.enum[0];
    }
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }
  if (schema.type === 'integer') return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  if (schema.type === 'boolean') return Boolean(value);
  return value;
}

async function structuredCall({ config, system, content, schema, effort, onText }) {
  if (schemaFormatSupported) {
    try {
      const msg = await callClaude({ config, system, content, effort, format: schema, onText });
      return fillBySchema(parseJSON(textOf(msg)), schema);
    } catch (err) {
      // Một số triển khai/giới hạn độ phức tạp schema trả 400 → chuyển sang mô tả schema trong prompt.
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      schemaFormatSupported = false;
    }
  }
  const withSchema = [
    ...content,
    { type: 'text', text: `Trả về DUY NHẤT một đối tượng JSON hợp lệ (không markdown, không giải thích) đúng JSON Schema sau:\n${JSON.stringify(schema)}` },
  ];
  const msg = await callClaude({ config, system, content: withSchema, effort, onText });
  return fillBySchema(parseJSON(textOf(msg)), schema);
}

function originalBlocks(input) {
  if (!input) return [];
  if (input.kind === 'pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } },
      { type: 'text', text: 'Tài liệu PDF ở trên là KHBD gốc của giáo viên.' },
    ];
  }
  return [{ type: 'text', text: `<ban_goc_cua_giao_vien>\n${input.text}\n</ban_goc_cua_giao_vien>` }];
}

// 1) Tra cứu yêu cầu cần đạt + nội dung SGK bằng web search (server tool).
export async function research({ config, opts, input, onText }) {
  const system = 'Bạn là trợ lý tra cứu chương trình GDPT 2018 và SGK Việt Nam. Chỉ báo cáo điều tìm thấy trong nguồn; ghi rõ điều chưa xác minh được. Không bịa.';
  const hint = input?.kind === 'text' ? input.text.slice(0, 2500) : '';
  const content = [
    {
      type: 'text',
      text: `Tra cứu cho KHBD sau:\n${buildMetaBlock(opts)}\n\nĐoạn đầu bản gốc (để nhận diện bài):\n${hint}\n\nHãy tìm và đối chiếu ≥2 nguồn (ưu tiên trang chính thống, loigiaihay, vietjack, tech12h, kenhgiaovien, hoc10, sachmem):\n1. Yêu cầu cần đạt của bài/chủ đề theo CT GDPT 2018 (và theo SGK/PPCT nếu có).\n2. Nội dung SGK của đúng bài: các mục/bài tập, số trang, ngữ liệu chính, đáp án các bài tập nếu có.\n3. Điểm nào trong bản gốc của GV khác với SGK (nếu phát hiện).\nTrình bày ngắn gọn bằng tiếng Việt, mỗi ý ghi nguồn URL. Mục nào không tìm được thì ghi "CHƯA XÁC MINH".`,
    },
  ];
  const msg = await callClaude({
    config,
    system,
    content,
    effort: 'medium',
    maxTokens: 16000,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
    onText,
  });
  const urls = new Set();
  for (const b of msg.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === 'web_search_result' && r.url) urls.add(r.url);
    }
  }
  return { tom_tat: textOf(msg), nguon: [...urls].slice(0, 12) };
}

// 2) Soạn mới / nâng cấp / trích xuất KHBD sang cấu trúc.
export async function generateKHBD({ config, opts, input, researchResult, mode, onText }) {
  const system = buildSystemPrompt(config);
  const nhiemVu = {
    nang_cap:
      'NHIỆM VỤ: NÂNG CẤP bản KHBD gốc của giáo viên thành KHBD hoàn chỉnh đạt TOÀN BỘ danh mục bắt buộc (mục tiêu ≥ 88/100, không lỗi P1/P2). Giữ ngữ liệu, bài tập, đáp án và ý đồ của giáo viên; tái cấu trúc theo khung mẫu; bổ sung các phần còn thiếu.',
    soan_moi:
      'NHIỆM VỤ: SOẠN MỚI KHBD hoàn chỉnh đạt TOÀN BỘ danh mục bắt buộc (mục tiêu ≥ 88/100, không lỗi P1/P2) dựa trên thông tin bài học và kết quả tra cứu.',
    trich_xuat:
      'NHIỆM VỤ: TRÍCH XUẤT TRUNG THỰC bản KHBD gốc sang cấu trúc JSON để thẩm định. TUYỆT ĐỐI KHÔNG bổ sung, không sửa, không suy diễn: phần nào bản gốc không có thì để rỗng/mảng rỗng/false; phut_gv_thuyet_giang ước lượng đúng theo mô tả gốc; số phút lấy đúng như bản gốc (0 nếu không ghi). ghi_chu_thay_doi để rỗng.',
  }[mode];
  const content = [
    { type: 'text', text: `${nhiemVu}\n\n<thong_tin_bai_hoc>\n${buildMetaBlock(opts)}\n</thong_tin_bai_hoc>` },
    ...(researchResult
      ? [{ type: 'text', text: `<ket_qua_tra_cuu>\n${researchResult.tom_tat}\nNguồn: ${researchResult.nguon.join(' ; ')}\n</ket_qua_tra_cuu>` }]
      : [{ type: 'text', text: '<ket_qua_tra_cuu>Không tra cứu web. Dựa vào bản gốc; mọi chi tiết SGK chưa chắc ghi vào ghi_chu_can_kiem_tra.</ket_qua_tra_cuu>' }]),
    ...originalBlocks(input),
  ];
  return structuredCall({ config, system, content, schema: KHBD_SCHEMA, effort: mode === 'trich_xuat' ? 'medium' : config.effort_soan, onText });
}

// 3) Vòng tự sửa: đưa lỗi của bộ kiểm tra + phiếu chấm AI để sửa toàn bộ.
export async function reviseKHBD({ config, opts, khbd, issues, grade, input, onText }) {
  const system = buildSystemPrompt(config);
  const loi = issues.map((i, n) => `${n + 1}. [${i.muc_do}][${i.buoc}][${i.ma}] ${i.van_de} → ${i.de_xuat}`).join('\n');
  const ai = grade
    ? [
        ...grade.van_de_chuyen_mon.map((v) => `[${v.muc_do}] ${v.vi_tri}: ${v.van_de} → ${v.de_xuat_sua}`),
        ...(grade.buoc_2_3.cach_lay_lai_diem ? [`Bước 2/3: ${grade.buoc_2_3.cach_lay_lai_diem}`] : []),
        ...grade.buoc_6.filter((x) => x.diem < x.toi_da).map((x) => `Bước 6 ${x.ma} (${x.diem}/${x.toi_da}): ${x.cach_lay_lai_diem}`),
      ].join('\n')
    : '';
  const content = [
    {
      type: 'text',
      text: `NHIỆM VỤ: SỬA bản KHBD (JSON) dưới đây để khắc phục TẤT CẢ lỗi được liệt kê, giữ nguyên các phần đã đạt, rồi trả về bản JSON HOÀN CHỈNH (không phải bản vá).\n\n<thong_tin_bai_hoc>\n${buildMetaBlock(opts)}\n</thong_tin_bai_hoc>\n\n<loi_bo_kiem_tra_tu_dong>\n${loi || '(không có)'}\n</loi_bo_kiem_tra_tu_dong>\n\n<gop_y_cham_chuyen_mon>\n${ai || '(không có)'}\n</gop_y_cham_chuyen_mon>\n\n<khbd_hien_tai>\n${JSON.stringify(khbd)}\n</khbd_hien_tai>`,
    },
    ...originalBlocks(input),
  ];
  return structuredCall({ config, system, content, schema: KHBD_SCHEMA, effort: config.effort_soan, onText });
}

// 4) Chấm phần cần đánh giá chuyên môn (Bước 2/3, Bước 6) — không chấm khống.
export async function gradeKHBD({ config, khbd, validation, researchResult, onText }) {
  const system = buildSystemPrompt(config);
  const is4PP = khbd.meta.phuong_phap !== 'THUONG';
  const tieuChi = is4PP
    ? 'Bước 6 (tiết 4PP): chấm TC1 (tối đa 10), TC3 (10), TC4 (12), TLIM (4), TQ (4). TC2 (Bloom) là CHỜ DỰ GIỜ — KHÔNG đưa vào.'
    : 'Bước 6 (tiết thường, CV5555): chấm 6 tiêu chí 1.1, 1.2, 1.3, 1.4, 2.1, 2.3 — mỗi tiêu chí toi_da=10, diem chỉ nhận 10 (Mức 3), 7 (Mức 2) hoặc 4 (Mức 1). 2.2, 2.4, 3.1–3.4 CHỜ DỰ GIỜ — KHÔNG đưa vào.';
  const content = [
    {
      type: 'text',
      text: `NHIỆM VỤ: Với vai trò chuyên viên thẩm định, chấm KHBD dưới đây theo đúng rubric chính thức.\n- Bước 2/3 (tối đa 10): đối chiếu yêu cầu cần đạt (${khbd.can_cu_chuong_trinh.la_bai_mo_rong ? 'bài mở rộng → nới lỏng theo Bước 3' : is4PP ? 'tiết 4PP → Bước 3 nới lỏng' : 'tiết thường → Bước 2 chặt'}).\n- ${tieuChi}\n- Liệt kê lỗi chuyên môn mà bộ kiểm tra theo quy tắc KHÔNG phát hiện được: sai kiến thức, đáp án sai, nhiệm vụ không khả thi trong thời lượng, sản phẩm không khớp mục tiêu, câu hỏi định hướng hình thức...\n- Chỉ chấm điều nhìn thấy trên bản thiết kế. Nghiêm khắc, công bằng, mỗi điểm trừ phải nêu căn cứ và cách lấy lại điểm.\n\n<ket_qua_bo_kiem_tra_tu_dong>\n${JSON.stringify({ diem: validation.diem, so_loi: validation.issues.length })}\n</ket_qua_bo_kiem_tra_tu_dong>\n\n<ket_qua_tra_cuu>\n${researchResult ? researchResult.tom_tat : 'Không có — đối chiếu theo YCCĐ phổ biến của chủ đề và ghi chú GV kiểm tra lại.'}\n</ket_qua_tra_cuu>\n\n<khbd>\n${JSON.stringify(khbd)}\n</khbd>`,
    },
  ];
  return structuredCall({ config, system, content, schema: GRADE_SCHEMA, effort: config.effort_cham, onText });
}
