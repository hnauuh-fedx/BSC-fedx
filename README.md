# BSC Management System

## Prisma CLI Convention

Run Prisma commands only from the repository root through the `npm run prisma:*`
scripts. They load the root `.env` and invoke Prisma in the `apps/api` workspace.

- Do not run Prisma directly inside `apps/api`.
- Do not copy `.env` into a workspace or create `apps/api/.env`.
- Do not run `prisma migrate reset`.
- Run `npm run prisma:pull` only when intentionally synchronizing `schema.prisma`
  from PostgreSQL, because it can modify the schema file.

## Mô tả dự án
Hệ thống quản lý thẻ điểm cân bằng (BSC) nội bộ. Cho phép giao KPI, lập kế hoạch, nộp, duyệt và báo cáo BSC.

## Kiến trúc & Công nghệ
- **Monorepo** với npm workspaces
- **Frontend**: React + TypeScript + Vite
- **Backend**: NestJS + TypeScript (Modular Monolith + Layered Architecture)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Phân quyền**: RBAC với Data Scopes (GLOBAL, DEPARTMENT, SELF)

## Cấu trúc thư mục
- `apps/web/`: Frontend React application.
- `apps/api/`: Backend NestJS application.
- `packages/shared/`: Shared code (types, enums, constants).
- `docs/`: Tài liệu hệ thống.

## Cài đặt và Chạy

1. Cài dependency:
   ```bash
   npm install
   ```

2. Cấu hình môi trường:
   ```bash
   cp .env.example .env
   # Update variables in .env
   ```

3. Chạy các dịch vụ (PostgreSQL, Redis, MinIO) qua Docker:
   ```bash
   docker-compose up -d
   ```

4. Cập nhật Database (Prisma):
   ```bash
   npm run prisma:pull
   npm run prisma:generate
   ```
   *Lưu ý: Không chạy `prisma migrate dev --name init` ngay vì database đã được khởi tạo qua pgAdmin. Chỉ dùng pull để đồng bộ schema từ db về file schema.prisma.*
   *Quy ước: Sau khi đã chuyển sang dùng Prisma migration, KHÔNG SỬA TRỰC TIẾP schema trong pgAdmin nữa.*

5. Chạy ứng dụng:
   ```bash
   npm run dev:api  # Chạy Backend
   npm run dev:web  # Chạy Frontend
   ```

## Cơ chế Phân Quyền (RBAC + Scope)
Hệ thống kết hợp Permission (chức năng) và Scope (phạm vi dữ liệu):
- **Permission**: VD `bsc.approve`, `bsc.view`
- **Scope**: `GLOBAL` (toàn quyền), `DEPARTMENT` (trong đơn vị), `SELF` (cá nhân).
Decorator dùng tại controller: `@RequirePermissions('bsc.approve')`
