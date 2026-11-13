# Biên bản BSC: một bản cho mỗi kỳ

- Mỗi kỳ BSC có một biên bản hiện hành cho toàn công ty. Lưu tiếp cập nhật cùng ID.
- Khi mở trang hoặc đổi kỳ, tải biên bản hiện hành trước; chỉ lấy dữ liệu BSC để tạo mẫu khi kỳ chưa có biên bản.
- Số biên bản bắt buộc, được trim và không được rỗng. Kiểm tra khi lưu, in và xuất PDF.
- Cập nhật giữ kiểm tra `expectedVersion`. Tạo trùng hoặc cập nhật đồng thời trả HTTP 409; tải lại trước khi chỉnh sửa tiếp.
- Snapshot kết quả BSC đã lưu vẫn được giữ theo quy tắc hiện có. Mọi lần cập nhật vẫn có audit log.

## Migration

`20261113090000_one_minutes_per_cycle` chạy trong một transaction:

1. Thêm `archived_at`.
2. Giữ bản mới nhất theo `updated_at DESC, created_at DESC, id DESC` cho mỗi `cycle_id`.
3. Đánh dấu các bản dư bằng `archived_at`. Giữ nguyên nội dung, snapshot, thời điểm chỉnh sửa, sự kiện in/PDF và tham chiếu audit; không xóa bản ghi.
4. Tạo partial unique index `bsc_minutes_active_cycle_key` trên `cycle_id WHERE archived_at IS NULL`.

API chỉ đọc và cập nhật các bản chưa lưu trữ. Index có điều kiện được khai báo bằng SQL vì Prisma 5 không biểu diễn được index này trong schema.

Nếu bản mới nhất chưa có số, giữ nguyên dữ liệu đó và yêu cầu bổ sung số trước khi lưu/in/xuất PDF; không tự lấy số của bản cũ.

Áp dụng migration trước khi khởi động phiên bản API mới. Từ thư mục gốc, dùng cấu hình database đích đã kiểm tra:

```powershell
npx dotenv -e .env -- npm run prisma:migrate:deploy --workspace=apps/api
npm run prisma:generate
```

Database kiểm thử sử dụng `TEST_DATABASE_URL` và runner `npm run test:integration:bsc-minutes --workspace=apps/api`.
