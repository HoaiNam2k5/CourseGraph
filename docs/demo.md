# Kịch bản demo và checklist bàn giao

## Trước buổi bảo vệ

Đọc README, kiểm tra `.env` trên máy, chạy `scripts/start-local.ps1 -Background` nếu app chưa chạy. Mở http://127.0.0.1:3000 và kiểm tra `/api/health/ready` trả200. Không in mật khẩu hoặc đưa `.env` lên slide.

Chuẩn bị Word 55 trang và PowerPoint 15 slide trong deliverables; source ZIP; 7 CSV; query files; dump đã được thử và manifest. Mang bản build local để không phụ thuộc Internet. Thời lượng dưới đây là đề xuất, điều chỉnh theo thời gian giảng viên giao.

## 1. Bài toán và mô hình — khoảng1phút

Giải thích hướng A —TIEN_QUYET_CHO→ B: học A trước B. Sáu loại node và12 type có14cặp label/type/label. DANG_KY nối sinh viên với học kỳ; MO_DANG_KY mới nối học kỳ với môn. DA_HOC được quy ước hoàn thành đạt cho demo, không có điểm thật.

## 2. Bloom và Browser — khoảng2phút

Thực hiện hướng dẫn riêng [bloom-demo.md](bloom-demo.md). Phần chạy Bloom thực tế còn cần thực hành trên Neo4j Desktop; không coi ảnh graph của CourseGraph là ảnh Bloom. Chọn đúng database trong Browser rồi chạy một query cơ bản và một query nâng cao từ database/queries.

Ví dụ có kết quả chắc chắn trong baseline: MH005 có các môn phụ thuộc trực tiếp MH006/MH013/MH016; không có MH005→MH001. Chuỗi dài nhất có6cạnh, bắt đầu MH001. Chạy query đếm nghiệp vụ để loại AppUser/metadata khỏi thống kê210node.

## 3. Ứng dụng — khoảng3phút

Đăng nhập admin; mở danh sách môn, tìm MH005, xem chi tiết. Tạo một môn demo có mã riêng, sửa tên, tạo liên kết tiên quyết hợp lệ; thử cạnh ngược tạo chu trình và giải thích vì sao bị từ chối. Xóa liên kết/môn demo sau phần trình bày.

Mở mạng lưới MH005, thay đổi độ sâu, chọn node xem thuộc tính, tìm đường MH001→MH015. Chuyển sang gợi ý: SV002, chương trình CT001, học kỳ HK002 có MH009. Thử sinh viên mới để thấy môn không có tiên quyết cũng được gợi ý.

Tạo tài khoản VIEWER riêng; đăng nhập bằng VIEWER để cho thấy không có nút ghi. Giải thích server cũng chặn API403; việc ẩn nút không phải cơ chế bảo vệ duy nhất. Sau đổi quyền/khóa/logout, token cũ bị thu hồi.

## 4. Import/export và khôi phục — khoảng2phút

Chọn đủ7 CSV gốc, xem preview loại trùng rồi commit. Đối chiếu210node/1.568cạnh; export CSV quan hệ phải có tên QuanHeLienKet.csv để nhập lại. Mở manifest và restore-verification của bản backup đã thử. Chỉ restore trực tiếp khi đủ thời gian và luôn dùng đích coursegraph-restore, không overwrite bản chính.

## 5. Kết quả và giới hạn — khoảng1phút

Mở evidence/verification-summary.json và browser-results.json. Dữ liệu nguồn được audit và giữ nguyên. Không quảng cáo thời gian query đơn lẻ là benchmark tổng quát. Native chạy thật; Docker config đã kiểm tra nhưng build/runtime bị sandbox chặn. Bloom thực tế cần hoàn tất trên Desktop trước khi bảo vệ.

## Checklist theo10mục

- [ ] Lý thuyết/cài tool; xác nhận cách GV tính Bloom cho điều khoản2điểm lý thuyết.
- [ ] Demo Search/Expand/Filter/Perspective thực tế trong Bloom.
- [x] Bảng so sánh và tình huống ứng dụng được viết trong báo cáo/slide.
- [x] Database/schema/constraint và dữ liệu đủ cơ bản/nâng cao.
- [x] Import/export; dump/restore riêng có hash khớp và JWT secret được đổi.
- [x] 16 query đã chạy; có file kết quả và hướng dẫn demo GUI.
- [x] Web/API/Neo4j kết nối thật.
- [x] Quản trị user, CRUD, quan hệ, graph, gợi ý, thống kê và hỗ trợ dữ liệu.
- [x] Có Word/PPT/source/hướng dẫn; Word đã được kiểm tra55 trang.
- [ ] Diễn tập thuyết trình/câu hỏi và nộp đúng hạn theo yêu cầu GV.

Đóng góp triển khai được ghi theo thực tế: Nguyễn Hoài Nam làm code và hạ tầng theo yêu cầu. Không giữ nhận xét các thành viên khác hoàn thành100% khi chưa có căn cứ.
