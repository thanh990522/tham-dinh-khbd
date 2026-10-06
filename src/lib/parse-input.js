// Đọc file KHBD giáo viên tải lên (.docx / .txt / .md; .pdf được gửi thẳng cho Claude),
// giữ cấu trúc bảng dưới dạng "| ô | ô |", tách nhiều tiết/bài trong cùng file,
// và chạy "rà soát sơ bộ" theo từ khoá để biết bản gốc đang thiếu gì.

import mammoth from 'mammoth';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);

export function htmlToText(html) {
  let s = html;
  // Ảnh đã được thay bằng ký hiệu [HÌNH n] (xem extractText); ảnh không đọc được thì bỏ.
  s = s.replace(/<img[^>]*alt="(\[HÌNH \d+\])"[^>]*>/gi, ' $1 ');
  s = s.replace(/<img[^>]*>/gi, '');
  // Ô bảng: gộp các đoạn trong ô bằng " / " để mỗi hàng nằm trên một dòng
  s = s.replace(/<t([dh])(?:\s[^>]*)?>([\s\S]*?)<\/t\1>/gi, (_, _tag, inner) => {
    const cell = inner
      .replace(/<\/(p|li|h\d)>/gi, ' / ')
      .replace(/<br\s*\/?>/gi, ' / ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s*\/\s*(\/\s*)+/g, ' / ')
      .replace(/^\s*\/\s*|\s*\/\s*$/g, '')
      .trim();
    return `| ${cell} `;
  });
  s = s.replace(/<\/tr>/gi, '|\n');
  s = s.replace(/<table[^>]*>/gi, '\n[BẢNG]\n').replace(/<\/table>/gi, '[HẾT BẢNG]\n');
  s = s.replace(/<li[^>]*>/gi, '- ');
  s = s.replace(/<\/(p|h\d|li|ul|ol)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .filter((l, i, a) => l.trim() || (a[i - 1] && a[i - 1].trim()))
    .join('\n')
    .trim();
}

export async function extractText(buffer, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'docx') {
    const images = [];
    const { value, messages } = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (img) => {
          // Chỉ giữ PNG/JPEG/GIF (Word nhúng được); EMF/WMF bỏ qua
          const type = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[img.contentType];
          if (!type) return { src: '' };
          const data = Buffer.from(await img.read('base64'), 'base64');
          const size = imageSize(data, type);
          if (!size || size.width < 24 || size.height < 24) return { src: '' }; // bỏ ảnh đệm 1×1
          images.push({ n: images.length + 1, type, data, ...size });
          return { src: '', alt: `[HÌNH ${images.length}]` };
        }),
      }
    );
    return { kind: 'text', text: htmlToText(value), images, warnings: messages.filter((m) => m.type === 'error').map((m) => m.message) };
  }
  if (ext === 'txt' || ext === 'md') return { kind: 'text', text: buffer.toString('utf8'), warnings: [] };
  if (ext === 'pdf') return { kind: 'pdf', base64: buffer.toString('base64'), text: '', warnings: [] };
  if (ext === 'doc') throw new Error('File .doc (Word 97–2003) chưa hỗ trợ — vui lòng mở bằng Word và "Lưu thành" .docx.');
  throw new Error(`Định dạng .${ext} chưa hỗ trợ. Hãy dùng .docx, .pdf hoặc .txt.`);
}

// Đọc kích thước ảnh từ header (không cần thư viện ngoài)
export function imageSize(buf, type) {
  try {
    if (type === 'png' && buf.readUInt32BE(12) === 0x49484452) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (type === 'gif') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (type === 'jpg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const imageRefs = (text) => [...new Set([...String(text).matchAll(/\[HÌNH (\d+)\]/g)].map((m) => Number(m[1])))];

// Nhận diện tiêu đề tiết/bài ở đầu dòng: "Lesson 1:", "Tiết 12", "TIẾT 3 –", "Period 4", "Bài 5:"
const HEADING = /^\s*(?:lesson|period|tiết|bài|chủ đề)\s*(\d{1,3})\b\s*[:.–\-—]?\s*(.*)$/i;

export function splitLessons(text) {
  const lines = text.split('\n');
  const marks = [];
  lines.forEach((l, i) => {
    if (l.startsWith('|') || l.length > 140) return;
    const m = l.match(HEADING);
    if (m) marks.push({ i, so: Number(m[1]), tieu_de: l.trim() });
  });
  // chỉ coi là nhiều tiết nếu các số thứ tự khác nhau và mỗi phần đủ dài
  const distinct = new Set(marks.map((m) => m.so));
  if (marks.length < 2 || distinct.size < 2) return [{ so: 1, tieu_de: firstTitle(lines), text }];
  const parts = [];
  const seen = new Set();
  for (let k = 0; k < marks.length; k++) {
    if (seen.has(marks[k].so)) continue; // tiêu đề lặp lại trong bảng ghi bảng → bỏ qua
    seen.add(marks[k].so);
    let start = marks[k].i;
    // lấy kèm 1–2 dòng tiêu đề Unit/Chủ đề ngay phía trên (vd "UNIT 2: HEALTHY LIVING")
    while (start > 0 && lines[start - 1].trim() && lines[start - 1].length < 80 && !lines[start - 1].startsWith('|') && start > marks[k].i - 2) start--;
    const nextIdx = marks.slice(k + 1).find((m) => !seen.has(m.so));
    let end = nextIdx ? nextIdx.i : lines.length;
    if (nextIdx) {
      while (end > start + 1 && lines[end - 1].trim() && lines[end - 1].length < 80 && !lines[end - 1].startsWith('|') && end > nextIdx.i - 2) end--;
    }
    const body = lines.slice(start, end).join('\n').trim();
    if (body.length > 300) parts.push({ so: marks[k].so, tieu_de: marks[k].tieu_de, text: body });
  }
  return parts.length >= 2 ? parts : [{ so: 1, tieu_de: firstTitle(lines), text }];
}

function firstTitle(lines) {
  return (lines.find((l) => l.trim() && !l.startsWith('|')) || 'KHBD').trim().slice(0, 120);
}

// ───────────── Rà soát sơ bộ bản gốc theo từ khoá (không dùng AI) ─────────────
const CHECKS = [
  { ma: 'MT-KT', buoc: 'Bước 1', ten: 'Mục tiêu kiến thức', re: /(về kiến thức|kiến thức:|1\.\s*knowledge|knowledge)/i },
  { ma: 'MT-NL', buoc: 'Bước 1', ten: 'Mục tiêu năng lực', re: /(năng lực|competenc)/i },
  { ma: 'MT-PC', buoc: 'Bước 1', ten: 'Mục tiêu phẩm chất', re: /(phẩm chất|personal qualit|qualities)/i },
  { ma: 'MT-TLIM', buoc: 'Bước 1', ten: 'Mục tiêu TLIM (gọi tên thói quen 1–7)', re: /(TLIM|leader in me|thói quen\s*\d|habit\s*\d|sống chủ động|bắt đầu từ mục tiêu|ưu tiên điều quan trọng|tư duy cùng thắng|hiểu rồi được hiểu|hợp lực|rèn giũa bản thân|be proactive|begin with the end|put first things first|think win|seek first to understand|synergi[sz]e|sharpen the saw)/i },
  { ma: 'MT-TQ', buoc: 'Bước 1', ten: 'Mục tiêu Trao quyền', re: /(trao quyền|empower)/i },
  { ma: 'TB', buoc: 'Bước 1', ten: 'Thiết bị dạy học và học liệu', re: /(thiết bị|học liệu|materials|teaching aids|resources)/i },
  { ma: 'CN', buoc: 'Bước 1', ten: 'Hoạt động Chiêm nghiệm (thiếu = P1)', re: /(chiêm nghiệm|reflection|reflect\b|phản tư)/i, p1: true },
  { ma: 'CC', buoc: 'Bước 1', ten: 'Hoạt động Củng cố', re: /(củng cố|consolidat|wrap[- ]up)/i },
  { ma: 'CHDH', buoc: 'Bước 1', ten: 'Bộ câu hỏi định hướng của phương pháp (thiếu = P1 với tiết 4PP)', re: /(câu hỏi định hướng|câu hỏi dẫn dắt|guiding questions|câu hỏi chéo|PRAAD)/i },
  { ma: 'RB', buoc: 'Bước 1', ten: 'Rubric / tiêu chí đánh giá sản phẩm', re: /(rubric|tiêu chí đánh giá|thang đánh giá|bảng kiểm|checklist|success criteria)/i },
  { ma: 'PP', buoc: 'Bước 6', ten: 'Phương pháp Việt Anh (CT/LikeAbility/CrossAbility/Same-Different)', re: /(critical thinking|PRAAD|likeability|like ability|crossability|cross ability|same\s*[/-]\s*different|same\s+different)/i },
  { ma: 'AL-VAI', buoc: 'Bước 7', ten: 'Phân vai trong cặp/nhóm', re: /(phân vai|vai trò|nhóm trưởng|thư ký|người báo cáo|\broles?\b|leader|secretary|reporter|timekeeper)/i },
  { ma: 'AL-KT', buoc: 'Bước 7', ten: 'Kiểm tra mức hiểu giữa bài (thẻ thoát, bảng trắng, câu hỏi nhanh...)', re: /(thẻ thoát|exit ticket|bảng trắng|bảng con|mini[- ]?board|kiểm tra nhanh|quick check|phiếu một phút|one[- ]minute|thumbs up|concept check|ccq)/i },
  { ma: 'GT', buoc: 'Bước 7', ten: 'Gọi đích danh giá trị cốt lõi (Tôn trọng & Tự trọng, Trách nhiệm, Tài giỏi, Chính trực, Yêu thương)', re: /(tôn trọng và tự trọng|tài giỏi|chính trực|giá trị cốt lõi|core value)/i },
  { ma: 'AI', buoc: 'Bước 7', ten: 'Ghi rõ có/không sử dụng AI', re: /(sử dụng AI|không sử dụng AI|ứng dụng AI|\bAI\b|chatgpt|gemini|claude|trí tuệ nhân tạo)/i },
];

export function preAudit(text, phutMoiTiet = 45) {
  const items = CHECKS.map((c) => ({ ma: c.ma, buoc: c.buoc, ten: c.ten, co: c.re.test(text), p1: !!c.p1 }));
  const phut = [...text.matchAll(/\|\s*(\d{1,2})\s*(?:phút|ph|mins?|minutes?|')\s*\|?/gi)].map((m) => Number(m[1]));
  const phut2 = phut.length ? phut : [...text.matchAll(/\(?(\d{1,2})\s*(?:phút|mins?|minutes)\)?/gi)].map((m) => Number(m[1]));
  const tongPhut = phut2.reduce((s, x) => s + x, 0);
  return {
    items,
    thoi_gian: {
      cac_moc: phut2,
      tong: tongPhut,
      chuan: phutMoiTiet,
      khop: tongPhut === phutMoiTiet,
    },
    so_thieu: items.filter((i) => !i.co).length,
  };
}
