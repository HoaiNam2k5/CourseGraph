# Cài đặt và chạy local

## 1. Chuẩn bị

Node.js 24 LTS; Windows PowerShell; Neo4j Desktop với version database 2026.09.0 và Java21. Có thể chạy song song instance Desktop cũ vì CourseGraph dùng toàn bộ cổng riêng.

`npm ci` cài dependency theo lockfile. `npm run setup:env` tạo `.env` với secret ngẫu nhiên nếu file chưa tồn tại; giữ nguyên file đã có. Không copy password vào ảnh hoặc báo cáo.

## 2. Neo4j riêng

`powershell -ExecutionPolicy Bypass -File scripts/setup-neo4j.ps1 -Start`

Script sao chép binary từ cache Desktop vào `.local/neo4j`, không sao chép data/auth của instance cũ. Java lấy từ cache, đường dẫn có thể override bằng `-JavaHome`. Khởi chạy nền bằng cửa sổ ẩn, log ở `.local/neo4j-console.log`.

| Dịch vụ | Cổng local |
|---|---:|
| Web/API | 3000 |
| Vite khi phát triển | 5173 |
| Neo4j HTTP / Browser | 17474 |
| Neo4j Bolt | 17687 |
| Neo4j routing | 17688 |
| Cluster nội bộ / RAFT | 16000 / 17000 |
| Backup | 16362 |

Mọi listener database bind loopback. Không sửa password hay cấu hình instance Desktop cũ trên7474/7687.

## 3. Nhập dữ liệu

Chạy theo thứ tự `data:audit`, `data:normalize`, `data:import`, `data:verify`, `admin:create`. Chạy import hai lần không được tăng số node/cạnh; verify so sánh canonical SHA256, không chỉ số lượng. Mọi xung đột dữ liệu cần kiểm tra trước khi import lại.

## 4. Build và chạy

`npm run build`, sau đó `scripts/start-local.ps1 -Background`. Express phục vụ cả React build và `/api`, không cần Vite khi demo. Kiểm tra `/api/health/live` và `/api/health/ready` trước đăng nhập.

Tài khoản được tạo từ ADMIN_USERNAME/ADMIN_PASSWORD trong `.env`. Role ADMIN có quyền ghi và quản trị; VIEWER chỉ đọc. Cookie HttpOnly/SameSite, mutation yêu cầu CSRF token từ phiên; đổi quyền/khóa user/logout thu hồi token.

Chế độ dev: `npm run dev:api` và `npm run dev:web` ở hai terminal. Nếu môi trường chặn esbuild subprocess, dùng bản compile/build theo hướng dẫn thay vì dev watch.

## 5. Khi gặp lỗi

- 401 login: kiểm tra ADMIN_PASSWORD đúng mật khẩu đã seed. Chạy seed lại không reset user hiện có.
- 503 readiness: kiểm tra `.local/neo4j-console.log`, đúng port17687/database coursegraph và `.env`.
- Port3000 bận: xác định process, dùng stop-local chỉ khi PID thuộc app; không kill theo tên node/java chung.
- Tool Git bị sandbox chặn HEAD/index: source vẫn ở workspace, không báo commit thành công; chạy Git thủ công ngoài môi trường hạn chế nếu muốn version control.
- Không có Docker engine: bản native vẫn chạy đủ đồ án. Không cần mở port database ra LAN.

## 6. Chuẩn bị chạy với Neo4j Aura và Render

Trong phiên nạp dữ liệu, đặt `NEO4J_DEPLOYMENT=remote` và lấy các biến `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` từ file kết nối của Aura. Dùng đúng tên database trong file. Giữ các biến này ngoài Git.

- Chạy `npm run data:import -- --demo` để nạp bản demo. Script thay thông tin hồ sơ và mã sinh viên, giảng viên, đồng thời giữ cấu trúc liên kết nghiệp vụ. Kết quả `matchesSource: true` xác nhận dữ liệu đọc lại khớp với bản demo.
- Đặt `ADMIN_USERNAME` và `ADMIN_PASSWORD` riêng cho bản demo, rồi chạy `npm run admin:create`. Hai lệnh dùng database Aura được cấp sẵn khi `NEO4J_DEPLOYMENT=remote`.
- Trên Render, chọn **New → Blueprint** và kết nối nhánh `main` để áp dụng `render.yaml`. Điền bốn biến kết nối Aura từ file thông tin kết nối. Blueprint tạo Docker Web Service Free, đặt `NEO4J_DEPLOYMENT=remote`, `COOKIE_SECURE=true`, tạo `JWT_SECRET` và dùng `/api/health/ready`. Ứng dụng lấy HTTPS origin từ `RENDER_EXTERNAL_URL`. Khi dùng tên miền riêng, đặt `APP_ORIGIN` bằng origin HTTPS của tên miền. Sau khi build, kiểm tra đăng nhập và gợi ý môn trên URL công khai.
- Đưa mã nguồn cần cho build lên Git. Giữ CSV gốc, bản dump, báo cáo và file chứa mật khẩu ở máy cá nhân.
