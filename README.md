# CourseGraph — mạng lưới môn học và điều kiện tiên quyết

Ứng dụng đồ án NoSQL bằng React/TypeScript, Express và Neo4j.

## Triển khai bản demo

Repo có [Render Blueprint](render.yaml) cho một Docker Web Service gói Free. Khi kết nối Blueprint, nhập bốn biến kết nối từ Neo4j Aura đã nạp dữ liệu demo. Render tạo khóa phiên và ứng dụng dùng URL HTTPS do Render cấp. Xem [cấu hình Aura và Render](docs/setup.md#6-chuẩn-bị-chạy-với-neo4j-aura-và-render).

## Chạy trên máy Windows

Yêu cầu Node.js 24 LTS, Neo4j Desktop có distribution Neo4j 2026.09.0 và Java21 trong cache. Không cần server riêng. Neo4j cũ được giữ nguyên; môi trường ứng dụng dùng HTTP17474/Bolt17687 và database `coursegraph`.

Các lệnh nạp dữ liệu và kiểm thử dựa trên dữ liệu nguồn cần thư mục `CSV/` từ bộ đồ án trên máy cá nhân. Repo công khai chỉ chứa mã nguồn và tài liệu kỹ thuật.

```powershell
npm ci
npm run setup:env
powershell -ExecutionPolicy Bypass -File scripts/setup-neo4j.ps1 -Start
npm run data:audit
npm run data:normalize
npm run data:import
npm run data:verify
npm run admin:create
npm run build
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Background
```

Mở http://127.0.0.1:3000. Username lấy từ `ADMIN_USERNAME`, mật khẩu từ `ADMIN_PASSWORD` trong `.env` trên máy của anh. Script seed không đổi mật khẩu của user đã tồn tại. Nếu port đã có app chạy, dùng `scripts/stop-local.ps1` trước khi khởi động lại.

Nếu cache Neo4j/Java nằm nơi khác, truyền `-Distribution` và `-JavaHome` cho `setup-neo4j.ps1`. Runtime mới chỉ dành cho phát triển local theo entitlement Neo4j Desktop đã cài; không đem bản Enterprise Developer này lên server production.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run queries:verify
npm run test:e2e
npm audit --audit-level=high
```

Integration test chỉ dùng `coursegraph-test` trên instance riêng, không xóa dữ liệu `coursegraph` hay instance cũ. Các CLI mặc định compile bằng TypeScript rồi chạy JavaScript; không cần esbuild/tsx để chạy import hoặc test unit/integration.

## Dữ liệu

- Kiểm tra CSV trong bộ đồ án bằng `npm run data:audit`.
- Sau chuẩn hóa: **210 node nghiệp vụ, 1.568 quan hệ**, 6 label, 12 type/14 chiều quan hệ.
- Loại 10 dòng học kỳ và 800 dòng quan hệ trùng; giữ 78 cảnh báo lịch sử thiếu tiên quyết.
- `DA_HOC` được quy ước hoàn thành đạt cho demo; không suy ra điểm. `DANG_KY` là SinhVien → HocKy.
- Gợi ý môn yêu cầu hoàn thành tất cả tiên quyết trực tiếp và gián tiếp, loại môn đã hoàn thành/đang học; có bộ lọc chương trình và học kỳ.
- Schema và truy vấn mẫu nằm trong `database/`. Các lệnh xử lý dữ liệu ghi bản chuẩn hóa và kết quả kiểm tra vào `data/normalized/` và `evidence/` trên máy cá nhân.

## Vận hành

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-local.ps1
powershell -ExecutionPolicy Bypass -File scripts/restore-local.ps1 -BackupPath backups/coursegraph-YYYYMMDD-HHMMSS
```

Restore mặc định chỉ ghi `coursegraph-restore`, kiểm tra hash với manifest, tạo `.local/restored.env` với JWT secret mới. Database chính không bị overwrite. Dump chỉ chạy trên database đã stop; app được ghi PID phải được dừng trước snapshot để tránh lệch dữ liệu.

Đọc [hướng dẫn cài đặt](docs/setup.md), [vận hành](docs/operations.md), [API](docs/api.md), [kịch bản demo](docs/demo.md) và [demo bằng Bloom](docs/bloom-demo.md).

Cài đặt tự động ban đầu trên máy có cache Desktop tương thích: `powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1`. Dùng script này cho môi trường ban đầu; sau khi đã có dữ liệu tùy chỉnh, chỉ start app thay vì nhập lại baseline.

Trong môi trường chặn Playwright worker subprocess, có thể khởi chạy Chrome headless với profile riêng và CDP loopback19222, đặt `COURSEGRAPH_CDP_URL=http://127.0.0.1:19222`, rồi chạy `npm run test:e2e`. Script dùng Playwright CDP trên database/app E2E riêng, có8luồng kiểm tra. Môi trường thông thường chạy bộ Playwright runner tại tests/e2e.

Không đưa `.env`, `.local`, backup chứa tài khoản hoặc log nhạy cảm vào Git, Docker image hay gói source công khai.
