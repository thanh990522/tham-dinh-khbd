// Thiết kế đặc thù môn Tiếng Anh (Global Success – CT GDPT 2018): loại tiết, khung PPP/PDP,
// giai đoạn (stage) của từng hoạt động, nhãn song ngữ cho KHBD. Dùng chung cho schema, prompt,
// bộ sắp xếp, bộ kiểm tra và hai bộ xuất (Word/HTML).

export const LOAI_TIET_TA = ['', 'Getting Started', 'A Closer Look 1', 'A Closer Look 2', 'Communication', 'Skills 1', 'Skills 2', 'Looking Back & Project', 'Review', 'Other'];

export const KHUNG_TA = {
  PPP: 'PPP (Presentation – Practice – Production)',
  PDP: 'PDP (Pre – While – Post)',
  TTT: 'TTT (Test – Teach – Test)',
  TBLT: 'Task-based (Pre-task – Task cycle – Language focus)',
};

export const GIAI_DOAN_TA = [
  '', 'WARM-UP', 'LEAD-IN', 'PRESENTATION', 'PRACTICE', 'PRODUCTION',
  'PRE-LISTENING', 'WHILE-LISTENING', 'POST-LISTENING', 'PRE-READING', 'WHILE-READING', 'POST-READING',
  'PRE-SPEAKING', 'WHILE-SPEAKING', 'POST-SPEAKING', 'PRE-WRITING', 'WHILE-WRITING', 'POST-WRITING',
  'PRE-TASK', 'TASK CYCLE', 'LANGUAGE FOCUS', 'REVIEW', 'PROJECT', 'REFLECTION', 'CONSOLIDATION',
];

// Khung và trình tự stage gợi ý cho từng loại tiết của sách Global Success
export const GOI_Y_LOAI_TIET = {
  'Getting Started': { khung: 'PPP', stages: 'WARM-UP → LEAD-IN (listen & read) → PRESENTATION (vocabulary/structure in context) → PRACTICE → PRODUCTION' },
  'A Closer Look 1': { khung: 'PPP', stages: 'WARM-UP → PRESENTATION (vocabulary, pronunciation) → PRACTICE (controlled → freer) → PRODUCTION' },
  'A Closer Look 2': { khung: 'PPP', stages: 'WARM-UP → PRESENTATION (grammar: form – meaning – use) → PRACTICE → PRODUCTION' },
  Communication: { khung: 'PPP', stages: 'WARM-UP → PRESENTATION (Everyday English) → PRACTICE (role-play) → PRODUCTION (speaking task)' },
  'Skills 1': { khung: 'PDP', stages: 'WARM-UP → PRE-READING → WHILE-READING → POST-READING / PRE-SPEAKING → WHILE-SPEAKING → POST-SPEAKING' },
  'Skills 2': { khung: 'PDP', stages: 'WARM-UP → PRE-LISTENING → WHILE-LISTENING → POST-LISTENING / PRE-WRITING → WHILE-WRITING → POST-WRITING' },
  'Looking Back & Project': { khung: 'TBLT', stages: 'WARM-UP → REVIEW (vocabulary, grammar) → PROJECT (prepare – present – feedback)' },
  Review: { khung: 'TTT', stages: 'WARM-UP → REVIEW (language) → PRACTICE (skills) → PRODUCTION' },
};

export function isEnglishLesson(k) {
  return /english|tiếng anh|anh văn/i.test(`${k.meta.mon_hoc} ${k.meta.ngon_ngu_noi_dung}`) || Boolean(k.tieng_anh?.loai_tiet);
}

// Nhận loại tiết từ tên bài/đoạn đầu giáo án ("Unit 2 – Lesson 1: Getting Started", "SKILLS 2"…)
export function detectLessonType(text) {
  const s = String(text || '');
  const rules = [
    [/getting\s*started/i, 'Getting Started'],
    [/a\s*closer\s*look\s*(1|i)\b/i, 'A Closer Look 1'],
    [/a\s*closer\s*look\s*(2|ii)\b/i, 'A Closer Look 2'],
    [/\bcommunication\b/i, 'Communication'],
    [/\bskills?\s*(1|i)\b/i, 'Skills 1'],
    [/\bskills?\s*(2|ii)\b/i, 'Skills 2'],
    [/looking\s*back|\bproject\b/i, 'Looking Back & Project'],
    [/\breview\s*\d/i, 'Review'],
  ];
  return rules.find(([re]) => re.test(s))?.[1] || '';
}

// Stage mặc định khi AI bỏ trống: suy từ loại hoạt động (khung CV5512) và khung tiết
const STAGE_THEO_LOAI = {
  PPP: { khoi_dong: 'WARM-UP', xac_dinh_nhiem_vu: 'LEAD-IN', hinh_thanh_kien_thuc: 'PRESENTATION', luyen_tap: 'PRACTICE', van_dung: 'PRODUCTION' },
  PDP: { khoi_dong: 'WARM-UP', xac_dinh_nhiem_vu: 'LEAD-IN', hinh_thanh_kien_thuc: 'PRE-READING', luyen_tap: 'WHILE-READING', van_dung: 'POST-READING' },
  TTT: { khoi_dong: 'WARM-UP', xac_dinh_nhiem_vu: 'LEAD-IN', hinh_thanh_kien_thuc: 'REVIEW', luyen_tap: 'PRACTICE', van_dung: 'PRODUCTION' },
  TBLT: { khoi_dong: 'WARM-UP', xac_dinh_nhiem_vu: 'PRE-TASK', hinh_thanh_kien_thuc: 'PRE-TASK', luyen_tap: 'TASK CYCLE', van_dung: 'TASK CYCLE' },
};
export function defaultStage(a, khung) {
  if (a.loai === 'chiem_nghiem') return 'REFLECTION';
  if (a.loai === 'cung_co') return 'CONSOLIDATION';
  return (STAGE_THEO_LOAI[khung] || STAGE_THEO_LOAI.PPP)[a.loai] || '';
}

// Nhãn song ngữ cho các đề mục KHBD (khung CV5512 giữ tiếng Việt, kèm tên quen dùng của GV tiếng Anh)
export const HEAD = {
  vi: {
    title: 'KẾ HOẠCH BÀI DẠY', mucTieu: 'I. MỤC TIÊU', kienThuc: '1. Về kiến thức', nangLuc: '2. Về năng lực', nlChung: 'a) Năng lực chung:', nlDacThu: 'b) Năng lực đặc thù:', phamChat: '3. Về phẩm chất',
    thietBi: 'II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU', gv: 'Giáo viên: ', hs: 'Học sinh: ', tienTrinh: 'III. TIẾN TRÌNH DẠY HỌC', khoKhan: 'IV. DỰ KIẾN KHÓ KHĂN VÀ GIẢI PHÁP', veNha: 'V. HƯỚNG DẪN TỰ HỌC Ở NHÀ',
  },
  en: {
    title: 'KẾ HOẠCH BÀI DẠY (LESSON PLAN)', mucTieu: 'I. MỤC TIÊU (OBJECTIVES)', kienThuc: '1. Kiến thức (Knowledge)', nangLuc: '2. Năng lực (Competences)', nlChung: 'a) Năng lực chung (Core competences):', nlDacThu: 'b) Năng lực đặc thù (Language competences):', phamChat: '3. Phẩm chất (Personal qualities)',
    thietBi: 'II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU (MATERIALS)', gv: 'Teacher: ', hs: 'Students: ', tienTrinh: 'III. TIẾN TRÌNH DẠY HỌC (PROCEDURES)', khoKhan: 'IV. DỰ KIẾN KHÓ KHĂN VÀ GIẢI PHÁP (ASSUMPTIONS)', veNha: 'V. HƯỚNG DẪN VỀ NHÀ (HOMEWORK)',
    lop: 'Grade', mon: 'Subject: English', tuan: 'Week', tiet: 'Period', giaoVien: 'Teacher', loaiTiet: 'Lesson', khung: 'Framework',
    ngonNgu: 'Phân tích ngôn ngữ (Language analysis)', ngonNguHead: ['Form', 'Pronunciation', 'Meaning', 'Vietnamese equivalent'],
    bang: 'Kế hoạch bảng (Board plan)', khoKhanHead: ['Anticipated difficulties', 'Solutions'], trongTam: 'Language focus: ',
  },
};

// Dòng "Week … · Period …" (giữ "……" khi chưa có để GV điền tay)
export const weekPeriod = (m, en) => (en ? `Week: ${m.tuan || '……'}   ·   Period: ${m.tiet_ppct || '……'}` : `Tiết PPCT: ${m.tiet_ppct || '……'}   ·   Tuần: ${m.tuan || '……'}`);

// Đọc "Week 3 / Tuần 3" và "Period 12 / Tiết 12 / Tiết PPCT: 12" trong giáo án gốc (để điền sẵn ô nhập)
export function detectWeekPeriod(text) {
  const s = String(text || '').slice(0, 3000);
  const week = s.match(/\b(?:week|tuần)\s*[:.]?\s*(\d{1,2})\b/i)?.[1] || '';
  const period = s.match(/\b(?:period|tiết(?:\s*ppct)?)\s*[:.]?\s*(\d{1,3})\b/i)?.[1] || '';
  return { week, period };
}
