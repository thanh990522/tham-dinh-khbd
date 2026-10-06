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
9. Hiển thị tiến trình trực tiếp; có mã truy cập; giới hạn số job chạy đồng thời.

## Chạy thử

```bash
npm install
cp .env.example .env    # điền ANTHROPIC_API_KEY và ACCESS_CODE
export $(grep -v '^#' .env | xargs)
npm start               # http://localhost:3000
npm test                # 23 kiểm thử
npm run sample          # kiểm tra + xuất Word cho mẫu TA7 Unit 2 Lesson 1
```

Khi chưa có `ANTHROPIC_API_KEY`, web vẫn chạy phần rà soát sơ bộ và kiểm tra/xuất Word từ file `.json`.

**Triển khai**: dùng `Dockerfile` kèm sẵn (Render, Railway, Fly.io, VPS…). Đặt `ANTHROPIC_API_KEY` và **bắt buộc đặt `ACCESS_CODE`** khi web công khai, vì mỗi lượt soạn đều tốn phí API.

## Mẫu đầu ra

`samples/TA7_Unit2_Lesson1.khbd.json` là bản nâng cấp **Unit 2 – Lesson 1: Getting started** từ giáo án TA7 gốc, theo phương pháp Same/Different. Bản này giữ nguyên ngữ liệu và đáp án của giáo viên, bổ sung TLIM (Thói quen 3), Trao quyền, Chiêm nghiệm, rubric và bộ câu hỏi định hướng. Thời lượng được sửa từ 36 lên 45 phút, HS hoạt động 78%. File Word đã xuất nằm trong `samples/output/`.

Bản gốc của tiết này (theo rà soát sơ bộ) thiếu 10/15 thành phần: TLIM, Trao quyền, Chiêm nghiệm (P1), bộ câu hỏi định hướng, rubric, phương pháp Việt Anh, phân vai, kiểm tra giữa bài, giá trị cốt lõi, ghi chú AI. Tổng thời gian ghi được là 36/45 phút. Lesson 4 và Lesson 6 cũng lệch giờ (41 và 44 phút).

## Cấu hình — `config/school.json`

- `diem_muc_tieu` (mặc định 88, ngưỡng Ngân hàng KHBD mẫu), `so_vong_tu_sua_toi_da` (mặc định 2), `model`, `effort_soan`, `effort_cham`, `tra_cuu_web`.
- **`tieu_chi_trao_quyen` — CẦN NHÀ TRƯỜNG XÁC NHẬN.** Tài liệu nguồn chỉ ghi "đáp ứng tối thiểu 4/6 tiêu chí trao quyền" mà **không liệt kê 6 tiêu chí**. Danh sách hiện tại (TQ-a…TQ-f) được tổng hợp tạm từ chính các tài liệu đó. Nhà trường cần thay bằng 6 tiêu chí chính thức. Validator và AI sẽ tự dùng danh sách mới.

## Giới hạn cần biết

- AI hỗ trợ soạn và chấm; **giáo viên/TTCM vẫn rà soát lần cuối**, đặc biệt các mục đánh dấu đỏ trong phụ lục "Căn cứ chương trình".
- Phần chấm theo quy tắc kiểm tra *dữ liệu khai báo* trong KHBD (vd số phút GV giảng). Phần này được đối chiếu chéo bởi bước AI chấm, nhưng không thay thế dự giờ.
- File `.doc` (Word 97–2003) cần lưu lại thành `.docx`. Hình ảnh trong giáo án gốc không được chép sang bản mới.
- Chưa tích hợp Google Drive/Sổ theo dõi. Đây là phần của skill thẩm định chạy trong Claude, có thể bổ sung sau.

## Cấu trúc mã

```
src/server.js            API + phục vụ giao diện
src/lib/parse-input.js   đọc .docx/.pdf/.txt, tách tiết, rà soát sơ bộ
src/lib/schema.js        JSON Schema của KHBD và phiếu chấm
src/lib/validator.js     bộ kiểm tra theo quy tắc + tổng hợp điểm /100
src/lib/prompts.js       system prompt (nhúng tài liệu chuẩn) + danh mục bắt buộc
src/lib/ai.js            gọi Claude API: tra cứu, soạn, sửa, chấm
src/lib/pipeline.js      điều phối vòng soạn – kiểm – chấm – sửa
src/lib/render-docx.js   xuất Word KHBD (CV5512 / 4PP 3 cột) và báo cáo
src/knowledge/           3 tài liệu chuẩn của skill (nguyên văn)
public/                  giao diện web
```
