# Mô hình dữ liệu CourseGraph

Nguồn gốc: bảy file CSV trong `CSV/`. File gốc được giữ nguyên; các file trong `data/normalized/` được sinh lại bằng `npm run data:normalize`.

## Thực thể

| Label | Khóa duy nhất | Thuộc tính |
|---|---|---|
| MonHoc | MaMH | TenMH, SoTC (integer), LoaiMon |
| SinhVien | MaSV | HoTen, NgaySinh (ISO date string), GioiTinh, Email, SDT, KhoaHoc |
| GiangVien | MaGV | HoTen, Email, SDT, HocVi |
| Khoa | MaKhoa | TenKhoa |
| HocKy | MaHK | TenHK, NamHoc |
| ChuongTrinhDaoTao | MaChuongTrinh | TenChuongTrinh, NamBatDau (integer), ThoiGianDaoTao (integer) |

Baseline chuẩn hóa: **210 node nghiệp vụ** gồm 50 môn, 100 sinh viên, 30 giảng viên, 10 khoa, 10 học kỳ, 10 chương trình.

## Quan hệ có hướng

| Label nguồn | Type | Label đích | Ý nghĩa |
|---|---|---|---|
| MonHoc | TIEN_QUYET_CHO | MonHoc | Môn nguồn phải hoàn thành trước môn đích |
| MonHoc | THUOC_KHOA | Khoa | Môn học thuộc khoa |
| SinhVien | THUOC_KHOA | Khoa | Sinh viên thuộc khoa |
| GiangVien | THUOC_KHOA | Khoa | Giảng viên thuộc khoa |
| Khoa | QUAN_LY | ChuongTrinhDaoTao | Khoa quản lý chương trình |
| ChuongTrinhDaoTao | BAO_GOM | MonHoc | Chương trình có môn học |
| SinhVien | THEO_HOC | ChuongTrinhDaoTao | Sinh viên theo chương trình |
| SinhVien | DA_HOC | MonHoc | Đã hoàn thành theo quy ước demo |
| SinhVien | DANG_HOC | MonHoc | Đang học |
| SinhVien | DANG_KY | HocKy | Đăng ký học kỳ, không phải đăng ký môn |
| GiangVien | PHU_TRACH | ChuongTrinhDaoTao | Phụ trách chương trình |
| GiangVien | GIANG_DAY | MonHoc | Giảng dạy môn |
| GiangVien | GIANG_DAY_TRONG | HocKy | Giảng dạy trong học kỳ |
| HocKy | MO_DANG_KY | MonHoc | Mở môn trong học kỳ |

Có **12 type, 14 bộ label nguồn/type/label đích**, tổng **1.568 cạnh duy nhất**. Schema này là whitelist cho import và API; không nối trực tiếp label/type do người dùng gửi vào Cypher.

## Chuẩn hóa và chất lượng nguồn

- `HocKy.csv`: 20 dòng, chỉ 10 khóa; 10 dòng giống hệt được loại trùng.
- `QuanHeLienKet.csv`: 2.368 dòng, 800 dòng trùng hoàn toàn; MERGE/import phải giữ 1.568 cạnh.
- Bỏ cặp ngoặc vuông của label CSV; ép kiểu số cho thuộc tính số, giữ số điện thoại dạng string để không mất số 0.
- Trùng khóa nhưng khác thuộc tính, endpoint mồ côi, type/hướng lạ, khóa trống, dữ liệu sai kiểu, self-loop và chu trình tiên quyết đều bị từ chối.
- 78 cặp DA_HOC thiếu ít nhất một tiên quyết trực tiếp trong lịch sử: lưu cảnh báo, không tự xóa. CSV không có điểm hoặc thời gian để suy diễn kết quả học thật.
- Quy ước v1: `DA_HOC` biểu thị môn đã hoàn thành đạt trong dữ liệu demo; không tự gán điểm.
- Ví dụ báo cáo MH005 → MH001 không tồn tại trong CSV. CSV có MH001 → MH002; MH005 trỏ trực tiếp tới MH006, MH013, MH016.

## Ràng buộc và phạm vi dữ liệu

`constraints.cypher` tạo unique constraint cho sáu business key và username của AppUser. AppUser/AppMeta không được tính vào baseline nghiệp vụ hoặc export dữ liệu môn học.

Mọi script import/verify phải dùng database ứng dụng tường minh và không nạp chồng lên database gốc chưa biết nội dung. Restore dump chỉ kiểm chứng ở instance/database riêng, không suy ra dump có cùng nội dung CSV.

Canonical SHA256 được tính từ node/edge đã sắp xếp, các property key theo thứ tự xác định; có thể đối chiếu sau import/export/restore. Số lượng bằng nhau chưa đủ để chứng minh nội dung bằng nhau.
