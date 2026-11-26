# Chuẩn bị demo Neo4j Bloom

## Tình trạng hiện tại

Ứng dụng native kết nối runtime riêng ở Bolt17687, database coursegraph; dữ liệu và driver đã được kiểm chứng. Instance Desktop cũ trên7474/7687 yêu cầu xác thực mà người dùng chưa có mật khẩu; dự án không reset mật khẩu hay thay đổi instance này. **Bloom chưa được xác nhận chạy trực tiếp trong phiên triển khai.**

Bloom miễn phí đi kèm database local được quản lý trong Desktop; kết nối remote có yêu cầu server/edition/license riêng. Vì vậy không mặc định kết nối runtime standalone trong .local vào Bloom sẽ có đầy đủ quyền miễn phí như một Desktop-managed instance.

Tài liệu chính thức: https://neo4j.com/docs/bloom-user-guide/current/bloom-installation/installation-activation/

## Cách chuẩn bị chắc chắn trước buổi bảo vệ

1. Mở Neo4j Desktop, tạo **local instance mới** cho demo, version2026.09.0; đặt mật khẩu mà anh quản lý. Không chọn reset/xóa instance cũ.
2. Chọn các cổng trống, tránh7474/7687 của instance cũ và17474/17687 của runtimeCourseGraph. Ghi lại HTTP/Bolt và tên database thực tế; tên instance khác tên database.
3. Stop đúng instance demo mới, dùng chức năng load dump vào database đích phù hợp. Dùng archive mới trong thư mục backup đã có restore-verification; xem `.local/verified-backup-path.txt` để lấy đúng bản đã thử. Giữ nguyên các file gốc.
4. Start instance demo, mở Query/Browser; chạy đếm6 label và12 type nghiệp vụ từ database/queries/basic.cypher. Kết quả đúng là210node/1.568cạnh, không tính AppUser/metadata.
5. Mở Studio → Bloom, chọn instance/database demo. Tạo Perspective chứa6 label và các quan hệ. Đặt caption MonHoc=TenMH hoặcMaMH, màu khác nhau theo label và làm nổi TIEN_QUYET_CHO.
6. Tìm MH005/Cơ Sở Dữ Liệu, mở rộng các cạnh tiên quyết hướng ra; giải thích3môn trực tiếp MH006/MH013/MH016. Mở rộng thêm để thấy phụ thuộc gián tiếp.
7. Thử lọc tín chỉ/loại môn và tùy chỉnh Perspective; lưu/export nội dung nếu đúng phiên bản/quyền hiện có hỗ trợ. Không mô tả tính năng chưa thử như kết quả đã hoàn thành.
8. Chụp ảnh thực tế mới vào evidence/bloom và ghi rõ version/kết nối/ngày thử. Cập nhật phần trạng thái Bloom trong báo cáo và checklist sau khi có bằng chứng.

Nếu muốn web và Bloom thao tác cùng một database trong buổi demo, sao lưu `.env`, đổi URI/database/credentials ứng dụng sang instance demo vừa xác minh rồi restart app. Không đổi sang instance cũ chưa có password. Test readiness/login và số liệu lại trước trình bày.

## Nội dung cần giải thích

Neo4j lưu trữ và truy vấn; Browser là giao diện Cypher; Bloom tập trung khám phá trực quan; CourseGraph là ứng dụng nghiệp vụ của đề tài. Bloom có thể chỉnh sửa tùy quyền/cấu hình/phiên bản, nên không khẳng định công cụ chỉ đọc. Graph trong web là vis-network, cần phân biệt rõ khi bảo vệ.
