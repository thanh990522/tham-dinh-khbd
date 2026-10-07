# Trợ lý KHBD Việt Anh — soạn & nâng cấp Kế hoạch bài dạy đạt chuẩn

Web nội bộ cho giáo viên và TTCM Trường Việt Anh: **tải lên một file giáo án → nhận lại file Word KHBD hoàn chỉnh** đáp ứng:

- **Công văn 5512 (Phụ lục IV)**: mục tiêu (kiến thức, năng lực chung + đặc thù, phẩm chất), thiết bị – học liệu, tiến trình 4 hoạt động với đủ a) Mục tiêu · b) Nội dung · c) Sản phẩm · d) Tổ chức thực hiện (4 bước).
- **4 phương pháp Việt Anh** (Critical Thinking/PRAAD, LikeAbility, CrossAbility, Same/Different): mục tiêu 5 phần (thêm TLIM, Trao quyền), bảng 3 cột, tiến trình 5 bước, Chiêm nghiệm, bộ câu hỏi định hướng và yếu tố đặc thù của từng phương pháp.
- **Active Learning** (Bước 7.D1 + khung ICAP), **5 giá trị & 7 thói quen**, **Ứng dụng AI**.
- **Bảng điểm thẩm định chính thức /100** (quy trình 7 bước, mã lỗi P1/P2/P3, quy tắc chặn duyệt).

Kèm theo là **Báo cáo thẩm định** giải trình từng điểm trừ, gồm: được/tối đa, mất bao nhiêu, vì sao, cách lấy lại điểm.

Toàn bộ chuẩn được lấy nguyên văn từ bộ skill `tham-dinh-khbd-viet-anh` (thư mục `src/knowledge/`) và tài liệu *Tiêu chí thẩm định KHBD Việt Anh*.

## Cách hoạt động

```
File giáo án (.docx/.pdf/.txt)            ┌──────────── vòng tự kiểm tra – tự sửa ────────────┐
   │ đọc, giữ bảng, tách nhiều tiết        │                                                   │
   ▼                                       ▼                                                   │
Rà soát sơ bộ bản gốc ─► Tra cứu web ─► Claude soạn/nâng cấp ─► Bộ kiểm tra QUY TẮC ─► Claude chấm ─┤
(từ khoá, thời gian)     (YCCĐ + SGK)   (JSON theo schema)       Bước 1, 4, 5, 7          Bước 2/3, 6   │
                                                                  + cấu trúc Bước 6                     │
                                         đạt ≥ 88/100, không P1/P2? ── chưa ── Claude sửa theo lỗi ──┘
                                                   │ đạt (hoặc hết số vòng)
                                                   ▼
                              KHBD_hoan_chinh.docx + Bao_cao_tham_dinh.docx + KHBD.json
```

**Kiểm tra theo quy tắc** (`src/lib/validator.js`, không dùng AI, có kiểm thử) soát những gì đo được khách quan:

| Thành phần | Điểm | Kiểm tra |
|---|---|---|
| Bước 1 – Khung mẫu | 15 | Đủ mục tiêu (5 phần với 4PP), thiết bị, 4 mục a–d mỗi hoạt động, Chiêm nghiệm (thiếu = **P1**), Củng cố, bộ câu hỏi định hướng (thiếu = **P1** với 4PP), rubric công bố đầu tiết, yếu tố đặc thù (LikeAbility < 3 cấp = **P1**, CrossAbility câu hỏi chéo + 2 rubric, PRAAD đủ 5 bước, Same/Different ≥2 phương án + so sánh) |
| Bước 4 – Thời gian | cảnh báo | Tổng = 45 × số tiết; không dồn Chiêm nghiệm/Củng cố |
| Bước 5 – Nhất quán | 20 | Ma trận mục tiêu ↔ hoạt động: mục tiêu bị bỏ rơi = **P1**, hoạt động lạc |
| Bước 7 – Đặc thù VA | 15 | AL: HS hoạt động ≥ 50% (< 30% = **P1**), GV giảng ≤ 10 phút/lượt, nhóm có phân vai, kiểm tra hiểu giữa bài · 5GT&7TQ: ≤ 2 mục đúng tên, gắn hoạt động (không thực hiện = **P1**), câu chiêm nghiệm, dòng rubric · AI: 4 dấu hiệu (không dùng AI → loại khỏi mẫu số) |
| Bước 6 (cấu trúc) | — | Tiến trình 5 bước đúng thứ tự, TLIM gọi đúng tên + công cụ, Trao quyền ≥ 4/6 tiêu chí |

**Claude chấm** phần cần chuyên môn: Bước 2/3 (yêu cầu cần đạt, có tra cứu web) và Bước 6 (4PPM: TC1, TC3, TC4, TLIM, Trao quyền; hoặc CV5555: 1.1–1.4, 2.1, 2.3). Các tiêu chí **chờ dự giờ** bị loại khỏi mẫu số, không chấm khống. Ở phần cấu trúc, hệ thống lấy **điểm thấp hơn** giữa AI và quy tắc.

## Tính năng

1. **Nâng cấp từ file**: giữ ngữ liệu, bài tập, đáp án và ý đồ của giáo viên, tái cấu trúc theo khung, bổ sung phần thiếu và ghi *nhật ký thay đổi* kèm lý do.
2. **Soạn mới**: chỉ cần nhập môn, lớp, tên bài.
3. **Chỉ thẩm định bản gốc** (dành cho TTCM): cấu trúc hoá trung thực, không sửa, rồi chấm /100.
4. **File nhiều tiết** (vd cả Unit 7 lesson): tự tách, chọn tiết cần xử lý, gộp chung 1 file Word.
5. **Tự chọn phương pháp** phù hợp nhất (hoặc chỉ định THUONG/CT/LA/CA/SD).
6. **Tra cứu YCCĐ + SGK** bằng web search; chi tiết chưa xác minh được thì **đánh dấu đỏ "GV kiểm tra lại theo SGK"**, không bịa.
7. **Rà soát sơ bộ miễn phí** (không cần AI) ngay khi tải file: thiếu thành phần nào, tổng thời gian bao nhiêu.
8. **Tải lên file `.json`** (đã xuất từ lần trước, có thể đã chỉnh tay): kiểm tra lại và xuất Word mà không tốn phí AI.
9. **Giữ hình ảnh của giáo viên**: tranh/ảnh trong file .docx gốc được chép sang bản mới đúng hoạt động sử dụng; ảnh chưa gắn được đưa vào phụ lục.
10. **⚙ Cài đặt trên web**: nhập khoá API Claude (lưu trên trình duyệt của từng máy), sửa **6 tiêu chí Trao quyền**, điểm mục tiêu, số vòng tự sửa, tổ chuyên môn mặc định.
11. **Thiết kế riêng cho môn Tiếng Anh** (Global Success): tự nhận loại tiết (Getting Started, A Closer Look 1/2, Communication, Skills 1/2, Looking Back & Project) và khung PPP / Pre–While–Post / TTT / Task-based; đầu trang *Subject – Grade · Week · Period*; bảng **Language analysis** (Form | Pronunciation | Meaning | Vietnamese equivalent); **Board plan**; bảng **Procedures** có cột Stage (WARM-UP, PRESENTATION, PRE-READING…); **Assumptions** dạng bảng; kiểm tra nhanh bằng CCQ/ICQ. Khung CV5512 và mọi tiêu chí thẩm định vẫn giữ nguyên.
12. **Nhập Tuần (Week) và Tiết PPCT (Period)** trên trang; tự đọc từ file nếu giáo án có ghi; chọn nhiều tiết thì Period tự tăng (12, 13, 14…).
13. Hiển thị tiến trình trực tiếp; mã truy cập tuỳ chọn; giới hạn số job chạy đồng thời. Làm việc hoàn toàn bằng **tải file lên – tải file về**, không cần Google Drive.

## Bản web dùng ngay trên claude.ai (không cần cài đặt, không cần khoá API)

**https://claude.ai/artifact/PXU57eEkBH4MhmBPATsWKh** — trang tinh gọn chỉ làm một việc: **nâng cấp giáo án thành KHBD hoàn chỉnh**.

1. Tải file giáo án `.docx` (một file có thể gồm nhiều tiết).
2. Chọn tiết cần nâng cấp, nhập **Tuần · Week** và **Tiết PPCT · Period** (giáo án tiếng Anh: chọn thêm loại tiết hoặc để tự nhận) (mục *Tuỳ chọn* để chỉ định phương pháp, ngôn ngữ, tên GV… nếu muốn).
3. Bấm **Nâng cấp KHBD** → tải về **một file Word KHBD hoàn chỉnh** (giữ ngữ liệu, bài tập, đáp án, hình ảnh gốc).

Bên trong mỗi tiết: Claude soạn 2 phần (mục tiêu – rubric – dàn ý, rồi tiến trình) → bộ kiểm tra quy tắc + Claude chấm theo bảng điểm /100 → tự sửa phần còn lỗi (tối đa 2 vòng) đến khi ≥ 88/100 và không còn lỗi P1/P2. Claude chạy trên tài khoản claude.ai của người dùng; yêu cầu cần đạt viết theo Chương trình GDPT 2018, không đối chiếu SGK hay PPCT của trường.

Mã nguồn: `web-artifact/` · đóng gói lại: `npm run build:web` → `web-artifact/dist/`.

## Cách dùng trên máy cá nhân (không cần máy chủ)

1. Cài **Node.js bản LTS** tại https://nodejs.org (một lần).
2. Tải mã nguồn về máy (nút *Code → Download ZIP* trên GitHub) rồi giải nén.
3. **Windows:** bấm đúp `Chay_KHBD_Windows.bat` · **macOS/Linux:** chạy `./chay_khbd_mac_linux.sh`. Lần đầu sẽ tự cài thư viện, sau đó trình duyệt tự mở `http://localhost:3000`.
4. Mở **⚙ Cài đặt** → dán **khoá API Claude** (tạo tại https://console.anthropic.com → API Keys; khoá chỉ lưu trên trình duyệt của máy đó).
5. Tải file giáo án lên → chọn tiết → **Tạo KHBD hoàn chỉnh** → tải về file Word KHBD và báo cáo thẩm định.

TTCM cập nhật **6 tiêu chí Trao quyền chính thức** và các cài đặt của tổ ngay trong mục ⚙ Cài đặt (khi mở web trên chính máy đang chạy chương trình, hoặc đặt biến `ADMIN_CODE` để sửa từ máy khác).

## Dùng chung cho cả tổ (tuỳ chọn)

Chạy trên một máy/máy chủ chung (có sẵn `Dockerfile`), mỗi người vẫn tự nhập khoá của mình; hoặc đặt `ANTHROPIC_API_KEY` để dùng chung khoá của trường — khi đó **nên đặt `ACCESS_CODE`** vì mỗi lượt soạn đều tốn phí API. Xem `.env.example`.

## Dành cho người phát triển

```bash
npm install
npm start               # http://localhost:3000
npm test                # 25 kiểm thử
npm run sample          # kiểm tra + xuất Word cho mẫu TA7 Unit 2 Lesson 1
node scripts/render-sample.js samples/TA7_Unit2_Lesson1.khbd.json samples/output <giáo_án_gốc.docx> 1   # kèm hình gốc
```

Khi chưa có khoá API, web vẫn chạy phần rà soát sơ bộ và kiểm tra/xuất Word từ file `.json`.

## Mẫu đầu ra

`samples/TA7_Unit2_Lesson1.khbd.json` là bản nâng cấp **Unit 2 – Lesson 1: Getting started** từ giáo án TA7 gốc, theo phương pháp Same/Different. Bản này giữ nguyên ngữ liệu và đáp án của giáo viên, bổ sung TLIM (Thói quen 3), Trao quyền, Chiêm nghiệm, rubric và bộ câu hỏi định hướng. Thời lượng được sửa từ 36 lên 45 phút, HS hoạt động 78%. 2 tranh từ vựng (fresh, join) của bản gốc được giữ ở HD2. Đáp án Bài 2–4 và hình thức Bài 5 đã đối chiếu với lời giải SGK qua tìm kiếm. File Word đã xuất nằm trong `samples/output/`.

Bản gốc của tiết này (theo rà soát sơ bộ) thiếu 10/15 thành phần: TLIM, Trao quyền, Chiêm nghiệm (P1), bộ câu hỏi định hướng, rubric, phương pháp Việt Anh, phân vai, kiểm tra giữa bài, giá trị cốt lõi, ghi chú AI. Tổng thời gian ghi được là 36/45 phút. Lesson 4 và Lesson 6 cũng lệch giờ (41 và 44 phút).

## Cấu hình — `config/school.json`

- `diem_muc_tieu` (mặc định 88, ngưỡng Ngân hàng KHBD mẫu), `so_vong_tu_sua_toi_da` (mặc định 2), `model`, `effort_soan`, `effort_cham`, `tra_cuu_web`.
- **`tieu_chi_trao_quyen` — CẦN NHÀ TRƯỜNG XÁC NHẬN.** Tài liệu nguồn chỉ ghi "đáp ứng tối thiểu 4/6 tiêu chí trao quyền" mà **không liệt kê 6 tiêu chí**. Danh sách hiện tại (TQ-a…TQ-f) được tổng hợp tạm từ chính các tài liệu đó (`da_xac_nhan: false`). Khi TTCM lưu danh sách chính thức ở ⚙ Cài đặt, `da_xac_nhan` chuyển thành `true`; bộ kiểm tra, AI và báo cáo sẽ dùng danh sách mới và bỏ ghi chú "TẠM".

## Giới hạn cần biết

- AI hỗ trợ soạn và chấm; **giáo viên/TTCM vẫn rà soát lần cuối**, đặc biệt các mục đánh dấu đỏ trong phụ lục "Căn cứ chương trình".
- Phần chấm theo quy tắc kiểm tra *dữ liệu khai báo* trong KHBD (vd số phút GV giảng). Phần này được đối chiếu chéo bởi bước AI chấm, nhưng không thay thế dự giờ.
- File `.doc` (Word 97–2003) cần lưu lại thành `.docx`. Ảnh dạng EMF/WMF (hình vẽ Word cũ) và ảnh trong file PDF không chép sang được; ảnh PNG/JPEG/GIF trong .docx được giữ.
- File `.json` tải lên lại không còn kèm ảnh gốc (chỉ còn ký hiệu "hình n trong giáo án gốc").

## Cấu trúc mã

```
src/server.js            API + phục vụ giao diện
src/lib/parse-input.js   đọc .docx/.pdf/.txt, tách tiết, rà soát sơ bộ
src/lib/schema.js        JSON Schema của KHBD và phiếu chấm
src/lib/validator.js     bộ kiểm tra theo quy tắc + tổng hợp điểm /100
src/lib/prompts.js       system prompt (nhúng tài liệu chuẩn) + danh mục bắt buộc
src/lib/ai.js            gọi Claude API: tra cứu, soạn, sửa, chấm
src/lib/pipeline.js      điều phối vòng soạn – kiểm – chấm – sửa
src/lib/english.js       đặc thù môn Tiếng Anh: loại tiết, khung PPP/PDP, stage, nhãn song ngữ, đọc Week/Period
src/lib/arrange.js       tự sắp xếp: trình tự, đánh số lại, cân 45 phút, gán stage tiếng Anh
src/lib/render-docx.js   xuất Word KHBD (CV5512 / 4PP 3 cột) và báo cáo
src/knowledge/           3 tài liệu chuẩn của skill (nguyên văn)
public/                  giao diện web
```
