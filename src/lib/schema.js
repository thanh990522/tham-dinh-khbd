// JSON Schema của một Kế hoạch bài dạy (KHBD) có cấu trúc.
// Dùng cho structured outputs của Claude (mọi object: tất cả trường bắt buộc,
// additionalProperties=false) và làm "hợp đồng dữ liệu" giữa AI ↔ bộ kiểm tra ↔ bộ xuất Word.

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const bool = (description) => ({ type: 'boolean', description });
const arr = (items, description) => ({ type: 'array', items, description });
const en = (values, description) => ({ type: 'string', enum: values, description });
const obj = (properties, description) => ({
  type: 'object',
  description,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const PHUONG_PHAP = {
  THUONG: 'Tiết thông thường (CV5512 – Phụ lục IV, chấm 12 tiêu chí CV5555)',
  CT: 'Critical Thinking (PRAAD)',
  LA: 'Multi-level: LikeAbility (cùng khả năng)',
  CA: 'Multi-level: CrossAbility (khác khả năng)',
  SD: 'Same / Different',
};

export const LOAI_HOAT_DONG = [
  'khoi_dong',
  'xac_dinh_nhiem_vu',
  'hinh_thanh_kien_thuc',
  'luyen_tap',
  'van_dung',
  'chiem_nghiem',
  'cung_co',
];

export const TEN_LOAI_HOAT_DONG = {
  khoi_dong: 'Khởi động / Mở đầu',
  xac_dinh_nhiem_vu: 'Xác định vấn đề / nhiệm vụ học tập',
  hinh_thanh_kien_thuc: 'Hình thành kiến thức mới',
  luyen_tap: 'Luyện tập',
  van_dung: 'Vận dụng',
  chiem_nghiem: 'Chiêm nghiệm',
  cung_co: 'Củng cố',
};

export const BUOC_4PP = ['lam_ro_ky_vong', 'thuc_hanh', 'bao_cao_danh_gia', 'chiem_nghiem', 'cung_co', 'khac'];

export const TEN_BUOC_4PP = {
  lam_ro_ky_vong: 'B1 Làm rõ kỳ vọng',
  thuc_hanh: 'B2 Thực hành',
  bao_cao_danh_gia: 'B3 Báo cáo – đánh giá',
  chiem_nghiem: 'B4 Chiêm nghiệm',
  cung_co: 'B5 Củng cố',
  khac: '—',
};

export const THOI_QUEN = {
  1: 'Sống chủ động',
  2: 'Bắt đầu từ mục tiêu (đích đến)',
  3: 'Ưu tiên điều quan trọng',
  4: 'Tư duy cùng thắng',
  5: 'Hiểu rồi được hiểu',
  6: 'Hợp lực',
  7: 'Rèn giũa bản thân',
};

export const GIA_TRI = {
  1: 'Tôn trọng và Tự trọng',
  2: 'Trách nhiệm',
  3: 'Tài giỏi',
  4: 'Chính trực',
  5: 'Yêu thương',
};

const mucTieu = obj(
  {
    id: str('Mã duy nhất, ví dụ KT1, NLC1, NLDT1, PC1'),
    noi_dung: str('Mục tiêu viết bằng động từ đo lường được (HS + động từ + nội dung + điều kiện)'),
  },
  'Một mục tiêu'
);

const cauHoi = obj({ hoi: str('Câu hỏi'), goi_y_dap_an: str('Gợi ý đáp án / lời giải đầy đủ') }, 'Câu hỏi kèm đáp án');

export const KHBD_SCHEMA = obj(
  {
    meta: obj(
      {
        truong: str('Tên trường'),
        to_chuyen_mon: str('Tổ chuyên môn'),
        giao_vien: str('Họ tên giáo viên (giữ từ bản gốc, để trống nếu không có)'),
        mon_hoc: str('Môn học'),
        lop: str('Khối/lớp, ví dụ 7'),
        ten_bai: str('Tên bài/chủ đề đầy đủ như SGK'),
        bo_sach: str('Bộ sách, mặc định Kết nối tri thức với cuộc sống (Global Success với Tiếng Anh)'),
        tiet_ppct: str('Tiết theo PPCT nếu có, để trống nếu không rõ'),
        so_tiet: int('Số tiết của KHBD này (thường là 1)'),
        tuan: str('Tuần dạy nếu có'),
        phuong_phap: en(Object.keys(PHUONG_PHAP), 'THUONG hoặc 1 trong 4 phương pháp Việt Anh'),
        ly_do_chon_phuong_phap: str('Vì sao phương pháp này phù hợp với nội dung bài'),
        su_dung_ai: bool('Tiết có sử dụng AI hay không'),
        ngon_ngu_noi_dung: str('Ngôn ngữ trình bày phần nội dung (vd Tiếng Việt / English)'),
      },
      'Thông tin chung'
    ),
    can_cu_chuong_trinh: obj(
      {
        yeu_cau_can_dat: arr(str('Một yêu cầu cần đạt'), 'Yêu cầu cần đạt GDPT 2018 của bài/chủ đề'),
        noi_dung_sgk_tom_tat: str('Tóm tắt nội dung/ngữ liệu SGK của bài (mục, bài tập, trang)'),
        nguon_tham_khao: arr(str('URL hoặc tên tài liệu'), 'Nguồn đã tra cứu'),
        la_bai_mo_rong: bool('Bài/chủ đề mở rộng ngoài SGK (áp dụng Bước 3 nới lỏng)'),
        ghi_chu_can_kiem_tra: arr(str('Chi tiết GV cần kiểm tra lại theo SGK'), 'Các điểm chưa xác minh được, KHÔNG bịa'),
      },
      'Căn cứ chương trình'
    ),
    muc_tieu: obj(
      {
        kien_thuc: arr(mucTieu, 'I.1 Về kiến thức'),
        nang_luc_chung: arr(mucTieu, 'I.2 Năng lực chung (tự chủ & tự học, giao tiếp & hợp tác, GQVĐ & sáng tạo)'),
        nang_luc_dac_thu: arr(mucTieu, 'I.2 Năng lực đặc thù môn học'),
        pham_chat: arr(mucTieu, 'I.3 Phẩm chất (GDPT 2018: yêu nước, nhân ái, chăm chỉ, trung thực, trách nhiệm)'),
        tlim: arr(
          obj(
            {
              id: str('TL1, TL2'),
              thoi_quen_so: int('Số thứ tự thói quen 1–7'),
              ten_thoi_quen: str('Tên thói quen đúng như danh mục'),
              cong_cu: str('Công cụ/khái niệm lãnh đạo đi kèm (vd Ma trận thời gian, Giải pháp thứ 3, Sơ đồ Venn...)'),
              hanh_vi_quan_sat: str('Hành vi quan sát được của HS trong tiết'),
            },
            'Thói quen TLIM'
          ),
          'I.4 TLIM — tối đa 2 mục (gộp với giá trị cốt lõi, tổng ≤ 2)'
        ),
        trao_quyen: arr(
          obj(
            {
              id: str('TQ1, TQ2'),
              noi_dung: str('Hoạt động GV trao quyền cho HS chủ động chiếm lĩnh/vận dụng kiến thức'),
              tieu_chi_dap_ung: arr(str('Mã tiêu chí trao quyền, vd TQ-a'), 'Các tiêu chí trao quyền đáp ứng'),
            },
            'Trao quyền'
          ),
          'I.5 Trao quyền (Empowerment)'
        ),
        gia_tri_cot_loi: arr(
          obj(
            {
              id: str('GT1'),
              gia_tri_so: int('Số thứ tự giá trị 1–5'),
              ten_gia_tri: str('Tên giá trị đúng như danh mục'),
              cap_bac: en(['Cơ bản', 'Phát triển', 'Thăng hoa', 'Bền vững'], 'Cấp bậc thể hiện nhắm tới'),
              hanh_vi_quan_sat: str('Hành vi quan sát được của HS'),
            },
            'Giá trị cốt lõi'
          ),
          'Giá trị cốt lõi Việt Anh (tổng TLIM + giá trị ≤ 2)'
        ),
      },
      'I. Mục tiêu'
    ),
    thiet_bi_hoc_lieu: arr(
      obj(
        {
          ten: str('Thiết bị/học liệu cụ thể'),
          doi_tuong: en(['GV', 'HS'], 'Ai chuẩn bị/sử dụng'),
          dung_cho_hoat_dong: arr(str('Mã hoạt động'), 'Dùng ở hoạt động nào'),
        },
        'Một thiết bị/học liệu'
      ),
      'II. Thiết bị dạy học và học liệu'
    ),
    ung_dung_ai: obj(
      {
        giao_vien: arr(
          obj(
            {
              khau: str('Khâu dùng AI (soạn học liệu, tạo câu hỏi phân hoá, dựng rubric...)'),
              cong_cu: str('Tên công cụ AI'),
              cach_kiem_chung: str('GV rà soát/kiểm chứng nội dung AI sinh ra thế nào'),
            },
            'Một lần dùng AI phía GV'
          ),
          'AI phía giáo viên'
        ),
        hoc_sinh_duoc_dung: bool('HS có được dùng AI trong tiết không'),
        nhiem_vu_hs_duoc_dung: arr(str('Nhiệm vụ'), 'Nhiệm vụ HS được dùng AI'),
        gioi_han: str('Giới hạn cho phép'),
        khau_bat_buoc_tu_lam: arr(str('Khâu'), 'Khâu HS bắt buộc tự làm, không dùng AI'),
        luu_dau_vet: str('HS lưu câu lệnh / dấu vết quá trình thế nào'),
        danh_gia_phan_biet: str('Cách đánh giá phân biệt tư duy HS với phần AI hỗ trợ'),
      },
      'Ứng dụng AI (nếu su_dung_ai=false thì để mảng rỗng/chuỗi rỗng)'
    ),
    rubric: arr(
      obj(
        {
          id: str('R1, R2'),
          ten: str('Tên rubric'),
          loai: en(['san_pham', 'trinh_bay', 'tiep_nhan', 'hanh_vi'], 'Loại rubric'),
          ap_dung_cho: arr(str('Mã hoạt động'), 'Hoạt động áp dụng'),
          thoi_diem_cong_bo: str('Công bố cho HS khi nào (bắt buộc: đầu tiết / khi giao nhiệm vụ)'),
          tieu_chi: arr(
            obj(
              {
                ten: str('Tiêu chí'),
                tot: str('Mức Tốt — mô tả quan sát được'),
                dat: str('Mức Đạt'),
                chua_dat: str('Mức Chưa đạt'),
                lien_ket_muc_tieu: arr(str('Mã mục tiêu/TLIM/GT'), 'Mục tiêu mà tiêu chí đo'),
              },
              'Tiêu chí rubric'
            ),
            'Các tiêu chí'
          ),
        },
        'Rubric'
      ),
      'Rubric / tiêu chí đánh giá sản phẩm HS'
    ),
    bo_cau_hoi_dinh_huong: obj(
      {
        mo_ta: str('Bộ câu hỏi định hướng theo khung của phương pháp'),
        nhom: arr(
          obj({ ten_nhom: str('Tên nhóm câu hỏi / chủ đề / phương án / bước'), cau_hoi: arr(cauHoi, 'Câu hỏi') }, 'Nhóm câu hỏi'),
          'Các nhóm câu hỏi'
        ),
      },
      'BỘ CÂU HỎI ĐỊNH HƯỚNG (thiếu hẳn = lỗi P1 với tiết 4PP)'
    ),
    dac_thu_phuong_phap: obj(
      {
        praad: obj(
          {
            muc_dich_loai: en(
              ['', 'ly_giai_su_kien', 'kiem_chung_thong_tin', 'tim_quy_luat', 'tim_lua_chon_tot_nhat'],
              'Chỉ điền khi phuong_phap=CT'
            ),
            muc_dich: str('P – Purpose'),
            tieu_chi: arr(str('R – tiêu chí'), 'R – Requirement'),
            gia_dinh: arr(str('A – giả định + căn cứ'), 'A – Assumption'),
            khia_canh: arr(str('Khía cạnh: nhà chuyên môn / người tác động / người chịu ảnh hưởng'), 'A – Analyze: khía cạnh'),
            gia_thuyet_minh_chung: arr(str('Giả thuyết + minh chứng'), 'A – Analyze: giả thuyết, minh chứng'),
            do_tin_cay_nguon: str('Cách đánh giá độ tin cậy nguồn theo 4 tiêu chí'),
            quyet_dinh: str('D – Decision: cách HS ra quyết định so với tiêu chí'),
          },
          'Critical Thinking – PRAAD (để rỗng nếu không phải CT)'
        ),
        cap_do_likeability: arr(
          obj(
            {
              ten: str('Cấp độ (Cơ bản/Khá/Giỏi)'),
              muc_bloom: str('Mức Bloom'),
              muc_tieu: str('Mục tiêu riêng của cấp độ, chia sẻ đầu bài'),
              nhiem_vu: arr(cauHoi, 'Nhiệm vụ/câu hỏi + lời giải'),
              nguong_len_cap: str('Ngưỡng hoàn thành để xét lên cấp'),
            },
            'Một cấp độ'
          ),
          'LikeAbility: ≥3 cấp độ (để rỗng nếu không phải LA)'
        ),
        chu_de_crossability: arr(
          obj(
            {
              ten: str('Chủ đề'),
              cau_hoi_dan_dat: arr(str('Câu hỏi dẫn dắt nghiên cứu'), 'Hệ thống câu hỏi dẫn dắt'),
              cau_hoi_cheo: arr(cauHoi, '≥2 câu hỏi chéo cho nhóm khác + đáp án'),
            },
            'Một chủ đề'
          ),
          'CrossAbility: 2–3 chủ đề (để rỗng nếu không phải CA)'
        ),
        phuong_an_same_different: arr(
          obj(
            {
              ten: str('Phương án / giải pháp'),
              dinh_huong: str('Định hướng thực hiện phương án'),
              tai_lieu: str('Tài liệu tham khảo cho phương án'),
            },
            'Một phương án'
          ),
          'Same/Different: ≥2 phương án (để rỗng nếu không phải SD)'
        ),
        hinh_thuc_same_different: str('SD: 1 trong 3 hình thức tổ chức'),
        yeu_cau_so_sanh: str('SD: yêu cầu so sánh giống/khác'),
      },
      'Yếu tố đặc thù phương pháp'
    ),
    hoat_dong: arr(
      obj(
        {
          id: str('HD0, HD1, ...'),
          ten: str('Tên hoạt động'),
          loai: en(LOAI_HOAT_DONG, 'Loại hoạt động'),
          buoc_4pp: en(BUOC_4PP, 'Bước trong tiến trình 5 bước 4PP'),
          thoi_gian_phut: int('Số phút'),
          phut_gv_thuyet_giang: int('Số phút GV giảng/trình bày liên tục (≤10)'),
          muc_tieu_ids: arr(str('Mã mục tiêu ở phần I'), 'Mục tiêu chung mà hoạt động phục vụ'),
          muc_tieu_hoat_dong: str('a) Mục tiêu của hoạt động'),
          noi_dung: str('b) Nội dung — nhiệm vụ HS làm (động từ hành động của HS)'),
          san_pham: str('c) Sản phẩm cụ thể, chấm được (kèm đáp án nếu có)'),
          to_chuc: obj(
            {
              giao_nhiem_vu: str('Bước 1 – Chuyển giao nhiệm vụ (mô tả cách giao, chất liệu dẫn nhập)'),
              thuc_hien_nhiem_vu: str('Bước 2 – HS thực hiện; GV quan sát, hỗ trợ'),
              bao_cao_thao_luan: str('Bước 3 – Báo cáo, thảo luận'),
              ket_luan_nhan_dinh: str('Bước 4 – Kết luận, nhận định'),
            },
            'd) Tổ chức thực hiện'
          ),
          hinh_thuc: en(['ca_nhan', 'cap_doi', 'nhom', 'ca_lop'], 'Hình thức tổ chức'),
          phan_vai: arr(obj({ vai: str('Vai trò'), nhiem_vu: str('Việc cụ thể của vai trò') }, 'Vai'), 'Phân vai (bắt buộc với cặp/nhóm)'),
          kiem_tra_hieu_bai: obj(
            {
              co: bool('Có điểm kiểm tra mức hiểu tại hoạt động này'),
              cong_cu: str('Câu hỏi nhanh / thẻ thoát / bảng trắng / phiếu một phút ...'),
              cach_dieu_chinh: str('GV điều chỉnh ngay thế nào theo kết quả'),
            },
            'Kiểm tra mức hiểu (formative check)'
          ),
          muc_icap: en(['passive', 'active', 'constructive', 'interactive'], 'Mức ICAP'),
          muc_bloom: en(['nho', 'hieu', 'van_dung', 'phan_tich', 'danh_gia', 'sang_tao'], 'Mức Bloom cao nhất của nhiệm vụ'),
          ho_tro_hs: str('Biện pháp hỗ trợ HS gặp khó / tổ chức để HS giúp nhau'),
          tlim_ids: arr(str('TL..'), 'Thói quen thực hành ở hoạt động này'),
          gia_tri_ids: arr(str('GT..'), 'Giá trị thực hành ở hoạt động này'),
          trao_quyen_ids: arr(str('TQ..'), 'Trao quyền thực hiện ở hoạt động này'),
          rubric_ids: arr(str('R..'), 'Rubric dùng ở hoạt động này'),
          dung_ai: str('Cách dùng AI trong hoạt động (rỗng nếu không)'),
          cau_hoi_chiem_nghiem: arr(
            obj({ hoi: str('Câu hỏi chiêm nghiệm'), cham_vao_ids: arr(str('TL../GT..'), 'Thói quen/giá trị mà câu hỏi chạm tới') }, 'Câu hỏi'),
            'Chỉ dùng ở hoạt động chiêm nghiệm'
          ),
        },
        'Một hoạt động'
      ),
      'III. Tiến trình dạy học'
    ),
    du_kien_kho_khan: arr(obj({ kho_khan: str('Khó khăn dự kiến'), giai_phap: str('Giải pháp') }, 'Dự kiến'), 'Dự kiến khó khăn & giải pháp'),
    huong_dan_ve_nha: str('Hướng dẫn tự học ở nhà / chuẩn bị bài sau'),
    ghi_chu_thay_doi: arr(str('Một thay đổi so với bản gốc + lý do theo tiêu chí'), 'Nhật ký nâng cấp so với bản gốc (rỗng nếu soạn mới)'),
  },
  'Kế hoạch bài dạy'
);

// Phiếu chấm của AI (dùng cho Bước 2/3, Bước 6 và nhận xét chuyên môn)
export const GRADE_SCHEMA = obj(
  {
    buoc_2_3: obj(
      {
        diem: int('0–10'),
        muc: en(['Tốt', 'Đạt', 'Cần cải thiện', 'Chưa đạt'], 'Mức'),
        can_cu: str('Căn cứ: bám sát/đủ/không thừa YCCĐ'),
        cach_lay_lai_diem: str('Sửa gì để được điểm tối đa (rỗng nếu tối đa)'),
      },
      'Yêu cầu cần đạt'
    ),
    buoc_6: arr(
      obj(
        {
          ma: str('Mã tiêu chí: TC1, TC3, TC4, TLIM, TQ (4PP) hoặc 1.1, 1.2, 1.3, 1.4, 2.1, 2.3 (CV5555)'),
          ten: str('Tên tiêu chí'),
          diem: int('Điểm đạt (4PP: theo thang của tiêu chí; CV5555: 10/7/4)'),
          toi_da: int('Điểm tối đa của tiêu chí (4PP: 10/10/12/4/4; CV5555: 10)'),
          muc: str('Tốt/Đạt/Cần cải thiện/Chưa đạt hoặc Mức 3/2/1'),
          can_cu: str('Căn cứ chấm, dẫn chiếu hoạt động'),
          cach_lay_lai_diem: str('Sửa gì để lấy lại điểm (rỗng nếu tối đa)'),
        },
        'Một tiêu chí Bước 6'
      ),
      'Các tiêu chí chấm được trên bản thiết kế'
    ),
    van_de_chuyen_mon: arr(
      obj(
        {
          muc_do: en(['P1', 'P2', 'P3'], 'Nhóm lỗi'),
          vi_tri: str('Vị trí (hoạt động/mục)'),
          van_de: str('Vấn đề'),
          de_xuat_sua: str('Đề xuất sửa cụ thể'),
        },
        'Vấn đề'
      ),
      'Lỗi chuyên môn quy tắc tự động không phát hiện được (sai kiến thức, đáp án sai, nhiệm vụ không khả thi...)'
    ),
    plus: arr(str('Điểm mạnh cụ thể'), 'PLUS'),
    delta: arr(str('Điểm cần cải thiện + đề xuất'), 'DELTA'),
    hoat_dong_hay: str('Hoạt động/nội dung hay nhất'),
  },
  'Phiếu chấm chuyên môn'
);
