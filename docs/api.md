# CourseGraph API

API thực dùng driver Neo4j, prefix `/api`. Khi chạy bản build, Express phục vụ cả React và API tại cùng origin. Credentials chỉ có trong `.env` riêng; không có mật khẩu mặc định công khai.

## Xác thực

`POST /auth/login` nhận `{ "username": "...", "password": "..." }`; phải có header `Origin` khớp `APP_ORIGIN`. Kết quả `{ user, csrfToken }`, JWT nằm trong cookie HttpOnly/SameSite=Strict, thời hạn theo `JWT_TTL_SECONDS`.

- `GET /auth/me`: lấy lại user và csrfToken sau khi tải trang.
- Mọi request POST/PATCH/PUT/DELETE sau login cần cookie, `Origin` đúng và header `x-csrf-token` từ login/me.
- `POST /auth/logout`: tăng tokenVersion, thu hồi các token cũ của tài khoản và xóa cookie.
- `POST /auth/change-password`: `{ currentPassword, newPassword }`, yêu cầu đăng nhập lại.
- JWT chỉ dùng HS256 với issuer/audience cố định. Mỗi request kiểm tra role/active/tokenVersion trong database; dữ liệu role trong giao diện không quyết định quyền ghi.
- Password 10–128 ký tự, lưu hash scrypt có salt ngẫu nhiên. API user không trả passwordHash.

## Quyền

| Tài khoản | Được phép |
|---|---|
| Chưa đăng nhập | Health, login |
| VIEWER | Catalog, danh sách/chi tiết dữ liệu, graph, đường đi, gợi ý, thống kê |
| ADMIN | Toàn bộ quyền xem, CRUD, quan hệ, tài khoản, import/export và lịch sử |

Không thể khóa hoặc hạ quyền quản trị viên đang hoạt động cuối cùng. Logout, đổi password, reset password, thay role hoặc active đều thu hồi token cũ. Khi restore database, phải đổi JWT_SECRET/generation trước mở lại app vì tokenVersion trong dump có thể cũ.

## Dữ liệu chung

Node: `{ id, label, properties }`, id là mã nghiệp vụ (ví dụ MH005). Không dùng elementId của Neo4j làm khóa API.

Entity slugs: `courses`, `students`, `lecturers`, `faculties`, `semesters`, `programs`.

- `GET /catalog` → `{ entities, relationships }`, gồm metadata form và whitelist hướng cạnh.
- `GET /:slug?q=&page=1&pageSize=20&facultyId=` → `{ items, total, page, pageSize }`. pageSize 1–100; tìm kiếm parameter hóa.
- `POST /:slug` nhận `{ properties: { ...đủ trường trong catalog... } }` → node, HTTP201.
- `GET /:slug/:id` → `{ node, links, prerequisites, dependents }`.
- `PATCH /:slug/:id` nhận `{ properties: { ...trường thay đổi... } }`; không đổi mã định danh.
- `DELETE /:slug/:id` →409 nếu có liên kết; admin có thể xác nhận `?force=true` để xóa kèm quan hệ trong transaction.
- Ngày ISO YYYY-MM-DD được kiểm tra ngày thực (31/02 bị từ chối); email, số nguyên, range và thuộc tính lạ đều được kiểm tra.

`links` là BusinessEdge `{ fromLabel, fromId, type, toLabel, toId }`. `prerequisites` và `dependents` là node array theo chuỗi tiên quyết nhiều cấp.

## Quan hệ và học tập

- `GET /relationships` trả danh sách liên kết có hướng cho tài khoản đã đăng nhập. Mỗi phần tử gồm năm trường của `BusinessEdge` cùng `fromName` và `toName`. Dùng `q` để tìm theo mã, tên hoặc loại liên kết, `type` để lọc, `sort=from|to|type` và `order=asc|desc` để sắp xếp. Kết quả được phân trang bằng `page` và `pageSize`.
- `POST /prerequisites`, `DELETE /prerequisites`: `{ fromId, toId }` (môn nguồn là tiên quyết cho môn đích).
- `POST /relationships`, `DELETE /relationships`: BusinessEdge theo whitelist catalog.
- `PATCH /relationships` nhận `{ previous, next }` với hai cạnh theo cùng định dạng. Chỉ quản trị viên được sửa. Nếu cạnh mới trùng, thiếu đầu mút hoặc tạo chu trình tiên quyết, giao dịch giữ lại cạnh cũ.
- Tự trỏ/trùng/chu trình bị chặn. API quan hệ tổng quát không bỏ qua kiểm tra tiên quyết. Mọi thao tác ghi mạng lưới lấy cùng khóa trong database trước kiểm tra và ghi, kể cả import, nên hai request đối nghịch đồng thời không cùng thành công.
- `PUT /students/:id/completions`: `{ courseIds: [...] }`, thay danh sách DA_HOC và bỏ DANG_HOC ở các môn mới hoàn thành; không tạo môn thiếu hoặc tự xóa lịch sử dựa vào giả định.
- `GET /courses/:id/prerequisites`, `/dependents` → `{ items }`.

`DA_HOC` được quy ước là hoàn thành đạt cho demo; CSV gốc không có điểm thật. `DANG_KY` nối SinhVien → HocKy, không phải đăng ký môn.

## Gợi ý, graph và thống kê

- `GET /students/:id/recommendations?programId=&semesterId=` → `{ items, completedCount, rule, assessments }`.
- Mỗi assessment gồm `{ course, status, inScope, prerequisites, missingPrerequisites }`. `prerequisites` là toàn bộ tổ tiên, không lặp và sắp theo mã; `missingPrerequisites` là các môn chưa có DA_HOC. Status theo thứ tự ưu tiên `completed`, `studying`, rồi `eligible`/`blocked`; một môn đã hoàn thành vẫn giữ trạng thái đó khi lịch sử thiếu tiên quyết. Bộ lọc chỉ thay `inScope`; `items` chỉ gồm môn `eligible && inScope`. Một môn ngoài học kỳ/chương trình không bị gán nhầm là thiếu tiên quyết. Chương trình sinh viên không theo học trả đủ assessments nhưng tất cả `inScope=false`.
- Gợi ý kiểm tra **toàn bộ tiên quyết trực tiếp và gián tiếp**, không chỉ cha trực tiếp; gồm môn không có tiên quyết và sinh viên mới. Môn hoàn thành/đang học bị loại. Nếu chọn program thì sinh viên phải theo học chương trình và môn phải thuộc chương trình; chọn semester thì môn phải được mở trong học kỳ.
- Dữ liệu lịch sử có thể thiếu tiên quyết; việc đã hoàn thành một môn không tự suy ra đã hoàn thành mọi tổ tiên.
- `GET /graph?courseId=&depth=2`: depth1–6; chỉ mạng lưới môn học/tiên quyết. `{ nodes, edges, truncated }`; graph node ID `MonHoc:MH005`, khớp `edges.from/to`. Tối đa150 node/500 cạnh.
- `GET /paths?from=&to=` → `{ paths: [{ courses: [{ id, name }], length }], truncated }`. Trả một đường ngắn nhất theo đúng hướng tiên quyết; không có đường thì array rỗng.
- `GET /statistics` → `{ counts, relationshipCount, relationsByType, coursesByFaculty, mostDependent, longestChain }`. longestChain.length là số cạnh.

## Import/export

CSV được nhập/chuẩn hóa bằng pipeline `data:*` hoặc trực tiếp bằng giao diện chọn bảy file. UI/API cũng hỗ trợ JSON BusinessData `{ nodes: BusinessNode[], relationships: BusinessEdge[] }`, cùng định dạng JSON xuất từ app.

- `POST /imports/preview` nhận `{ data }` → `{ id, hash, summary: { nodes, relationships }, warnings }`.
- `POST /imports/csv/preview` nhận `{ files: [{ name, content }] }` với đúng bảy file: MonHoc.csv, SinhVien.csv, GiangVien.csv, Khoa.csv, HocKy.csv, ChuongTrinhDaoTao.csv, QuanHeLienKet.csv. Tên phân biệt hoa/thường, không nhận đường dẫn/tên trùng/tên khác. `content` là chuỗi UTF-8, hỗ trợ BOM. Giới hạn từng file2MiB, tổng raw CSV8MiB, JSON request10MiB; vượt giới hạn trả413.
- CSV preview trả cùng định dạng JSON preview và dùng cùng endpoint commit. Header được kiểm tra ngay cả file không có dòng dữ liệu; validation dùng lại pipeline chuẩn hóa, kiểm tra khóa/endpoint/hướng cạnh/chu trình. Dòng giống hệt được loại trùng, khóa trùng nhưng thuộc tính khác bị từ chối. File upload chỉ được ghi vào thư mục TEMP riêng với whitelist literal và được xóa khi xử lý xong hoặc lỗi; không ghi đè CSV gốc.
- Preview được validate và gắn user, hash, thời hạn một giờ; có thể tồn tại qua restart app do lưu trong Neo4j. Commit kiểm tra lại dữ liệu trong cùng khóa ghi; không cho user khác dùng preview.
- `POST /imports/:id/commit` → `{ nodes, relationships, hash }` của database sau import. Commit lại cùng preview trả cùng kết quả, không tạo lại cạnh/lịch sử.
- Import giống hệt là idempotent. Khóa trùng nhưng thuộc tính khác dữ liệu hiện có →409, không âm thầm ghi đè. Dùng CRUD tường minh hoặc import vào database trống nếu muốn dữ liệu khác.
- Import kiểm tra cả hợp của dữ liệu hiện có và dữ liệu mới để chặn chu trình đi qua các cạnh sẵn có.
- `GET /exports/business-data`: tải JSON nghiệp vụ, không chứa user/password/session/metadata.
- `GET /exports/csv?label=MonHoc` (hoặc nhãn trong catalog): tải CSV; `label=relationships` tải QuanHeLienKet.csv. Có BOM UTF-8 và header.
- `GET /transfers/history` → `{ items }` của 50 lần gần nhất, loại IMPORT/EXPORT, username, thời gian, số node/cạnh.
- Trước verify/export/import, API kiểm tra dữ liệu vật lý: node trùng mã, cạnh trùng, loại/hướng cạnh ngoài whitelist sẽ bị báo lỗi thay vì bị DISTINCT/normalization che đi.

## Health và lỗi

- `GET /health/live` →200 khi tiến trình API chạy.
- `GET /health/ready` →200 khi truy vấn target database được;503 nếu DB không sẵn sàng.
- `GET /system/connection` (ADMIN) kiểm tra lại database và trả `{ database, uri, browserUrl, deployment, checkedAt }`; loại credentials/query/fragment khỏi URI. Kiểu triển khai lấy từ `NEO4J_DEPLOYMENT` (`standalone`, `desktop`, `remote`, `unknown`); không suy đoán qua port. `NEO4J_BROWSER_URL` là HTTP(S) tùy chọn không có credentials/query/fragment. VIEWER bị từ chối403.
- Lỗi dạng `{ error, details?, requestId }`;400 input/schema,401 chưa đăng nhập/token hết hiệu lực,403 role/Origin/CSRF,404 không có,409 trùng/xung đột,413 upload quá lớn,503 DB unavailable.
- Query được parameter hóa; nhãn/type động chỉ từ whitelist. Không endpoint nào nhận shell command hay đường dẫn backup tùy ý.

## Kiểm thử

Integration tests bắt buộc tên database khớp `coursegraph-test` (hoặc suffix riêng); không chạy reset trên database chính. Bộ test dùng Neo4j thật cho CRUD, constraint, cycle đồng thời, phân quyền, CSRF, import và kiểm tra dữ liệu vật lý. Script `data:verify` đối chiếu hash canonical của tập node/cạnh, không chỉ số lượng.
