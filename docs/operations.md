# Vận hành, sao lưu và khôi phục

## Bảo toàn nguồn

`scripts/snapshot-sources.ps1` sao chép 10 nguồn gốc và kiểm tra SHA256. `evidence/source-manifest.json` giữ hash gốc; audit tiếp theo thất bại nếu nguồn thay đổi. Báo cáo cập nhật phải xuất thành file mới trong deliverables.

## Backup database của ứng dụng

Chạy `scripts/backup-local.ps1` tại workspace. Script chỉ chấp nhận coursegraph hoặc coursegraph-test trên instance riêng. Nếu web đang chạy bằng PID đã ghi, dừng web trước snapshot và khởi động lại sau khi database start. Nếu process trên3000 không xác định, dừng để người vận hành xử lý.

Quy trình: snapshot dữ liệu nghiệp vụ/canonical hash → STOP DATABASE → neo4j-admin database dump → checksum archive → START DATABASE → restart web nếu cần. Không mở API nhận lệnh shell hoặc đường dẫn tự do.

Mỗi thư mục backup có manifest.json, coursegraph.dump và archive.json. Dump chứa AppUser và dữ liệu ứng dụng; không cung cấp file này công khai cùng password/secret. User/role DBMS ở system database không được giả định nằm trong dump nghiệp vụ.

## Restore thử nghiệm

`scripts/restore-local.ps1 -BackupPath <thư mục backup trong workspace>` chỉ ghi coursegraph-restore. Kiểm tra đường dẫn và archive hash; copy archive sang staging với tên phù hợp; dừng target → load → khởi động → đối chiếu số lượng/hash với manifest.

Sau restore, script tạo `.local/restored.env` cho cổng3001, database coursegraph-restore và JWT_SECRET mới. Có thể khởi chạy thủ công `node --env-file=.local/restored.env dist/apps/api/src/server.js` để kiểm tra. Không dùng secret cũ: tokenVersion/role/active của AppUser có thể quay lùi theo backup. Mọi token phát hành trước restore phải bị từ chối; người vận hành kiểm tra lại user/role trước phục vụ.

## Mất kết nối database

Liveness chỉ phản ánh tiến trình web. Readiness phải truy vấn database và trả503 khi DB không sẵn sàng. Web hiển thị lỗi rõ ràng; không trả dữ liệu mẫu để che mất kết nối.

## Bloom và Browser

Browser ở http://127.0.0.1:17474. Kết nối Bolt17687, username NEO4J_USERNAME và password NEO4J_PASSWORD từ env. Chọn đúng database coursegraph rồi chạy từng câu trong database/queries.

Bloom trong Neo4j Desktop là phần demo tool riêng. Database managed bởi Desktop có cơ chế developer/local tương ứng; môi trường mới là runtime phát triển tách riêng, cần cấu hình kết nối/import vào Desktop phù hợp trước buổi bảo vệ. Không khẳng định Bloom đã chạy chỉ từ API/driver. Theo tài liệu chính thức, remote Bloom có yêu cầu server/cấp phép riêng: https://neo4j.com/docs/bloom-user-guide/current/bloom-installation/installation-activation/

## Các thao tác không thực hiện tự động

Không reset password instance cũ; không overwrite database chính khi restore thử; không expose Bolt ra Internet; không mua VPS/domain hoặc triển khai cloud. Source có thể chuẩn bị Docker nhưng trạng thái build/runtime phải ghi theo kiểm thử thực tế.
