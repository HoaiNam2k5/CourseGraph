# CourseGraph — định hướng giao diện

## Mục đích và phong cách

Giao diện là một không gian học thuật để tra cứu, quản trị và khám phá dữ liệu đào tạo. Phong cách chủ đạo là editorial utilitarian: chữ tiêu đề serif, dữ liệu được căn chỉnh chặt chẽ, phần đồ thị và đường đi đóng vai trò trung tâm.

DFII: impact 4 + context fit 5 + feasibility 5 + performance 4 − consistency risk 3 = **15**. Điểm này là đánh giá thiết kế, không phải kết quả kiểm thử.

## Hệ thống thị giác

- Forest `#153f37`, ivory `#f5f5ef`, amber `#aa6538`, các biến màu CSS tại `styles.css`.
- Palatino/Book Antiqua/Georgia cho tiêu đề; Segoe UI/Trebuchet cho nội dung. Dùng font cục bộ để buổi demo không phụ thuộc Internet.
- Nhịp khoảng cách 4–8px, bảng dữ liệu thoáng, sidebar gọn, vùng đồ thị rộng; đường viền mảnh thay cho đổ bóng dày.
- Dấu hiệu nhận diện: mô-típ nút/cạnh, dòng timeline tiên quyết và cặp serif–dữ liệu. Các con số dashboard luôn đến từ API thực tế.
- Chuyển động nhẹ ở hover; tôn trọng prefers-reduced-motion. Widget vis-network được destroy khi component unmount.

## Khả dụng và phạm vi

- Đợt nâng cấp sau bàn giao: chữ nội dung 15px; nhãn, bảng và chữ phụ tăng 2px; giảm khoảng trống đầu trang. Giữ font offline và nhận diện xanh rừng/kem/cam đất.
- Gợi ý có hai nhóm đủ/chưa đủ điều kiện, tiến độ tiên quyết và giải thích ngay trên từng thẻ. Khi đổi hồ sơ/bộ lọc, kết quả cũ được ẩn cho tới lần tra cứu tiếp theo.
- Đồ thị theo sinh viên dùng trạng thái học tập kèm nhãn chữ, không chỉ màu; chi tiết và chuỗi liên quan nằm cạnh canvas. Bản đồ giới hạn không được dùng để suy luận điều kiện tiên quyết; dữ liệu đánh giá do API tính trên toàn mạng lưới.
- Quản trị viên có thể mở thông tin kết nối từ badge database. Mật khẩu và token không xuất hiện trong bảng này; người xem chỉ thấy trạng thái sẵn sàng.

- Form có label, trạng thái lỗi/loading/empty, focus rõ và dialog HTML có focus trap gốc của trình duyệt.
- Sidebar thu gọn ở màn hình nhỏ; bảng có cuộn ngang; đồ thị có danh sách node thay thế cho tương tác canvas.
- Cookie HttpOnly và token CSRF; 401 kết thúc phiên phía UI. Tài khoản/quyền được backend kiểm tra lại.
- Không có dữ liệu mock thay thế khi API lỗi. Thông báo lỗi phải phản ánh tình trạng thật.
- Vue/React Router, thư viện animation và CDN không cần cho v1; hash navigation đủ cho không gian local.
- Xuất JSON/CSV qua API có xác thực; nhập JSON có bước preview trước commit. Sao lưu vật lý được thực hiện bởi script vận hành, không gọi shell từ giao diện web.

## Nguồn tham khảo

- React useEffect và cleanup: https://react.dev/reference/react/useEffect
- vis-network construction/events/options: https://visjs.github.io/vis-network/docs/network/
- Vite: https://vite.dev/guide/

## Phân biệt với giao diện mẫu

Mô hình mạng lưới dẫn dắt bố cục: danh mục → chi tiết liên kết → đồ thị → gợi ý. Khu vực dữ liệu được xây theo schema thực, đồng thời màu rừng và typography học thuật thống nhất toàn bộ màn hình.
