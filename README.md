# BSC Management System

## Prisma CLI Convention

Run Prisma commands only from the repository root through the `npm run prisma:*`
scripts. They load the root `.env` and invoke Prisma in the `apps/api` workspace.

- Do not run Prisma directly inside `apps/api`.
- Do not copy `.env` into a workspace or create `apps/api/.env`.
- Do not run `prisma migrate reset`.
- Run `npm run prisma:pull` only when intentionally synchronizing `schema.prisma`
  from PostgreSQL, because it can modify the schema file.

## Integration tests on PowerShell

Integration runners require a dedicated test database and fail closed when
`TEST_DATABASE_URL` is missing or points to a non-test database. They log only
the database name, never the full connection string.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/bsc_organization_test?schema=public'
npm run prisma:test:deploy
npm run test:integration:organization --workspace=apps/api
npm run test:integration:bsc-draft --workspace=apps/api
npm run test:integration:bsc-scoring --workspace=apps/api
npm run test:integration:bsc-dual-stage-workflow --workspace=apps/api
npm run test:integration:bsc-scoring-alignment --workspace=apps/api
Remove-Item Env:TEST_DATABASE_URL
```

For local use, the same value may be placed in the git-ignored
`.env.test.local` file. Never reuse the main `bsc_db` database.

## Browser E2E tests

Browser tests use Playwright with Chromium and the same dedicated database
guard. `TEST_DATABASE_URL` must point to the database named exactly
`bsc_organization_test`; the suite refuses `bsc_db` and every other database.
Fixtures use a unique `BSCE2E_<timestamp>_<uuid>` prefix, are removed in global
teardown, and cleanup is verified without truncating shared data.

Install the browser once, then run E2E from the repository root:

```powershell
npm run test:e2e:install
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/bsc_organization_test?schema=public'
npm run prisma:test:deploy
npm run test:e2e
npm run test:e2e:headed
Remove-Item Env:TEST_DATABASE_URL
```

The API and Vite servers used by E2E are owned by Playwright and are stopped
automatically after the run. Do not point these commands at production or the
main development database.

The pending-review performance regression records the former 10-row baseline
as 21 BSC requests (1 list + 10 detail + 10 scoring). The optimized list must
make 1 list request and 0 detail/scoring requests; opening one row may then make
exactly 1 detail and 1 scoring request.

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
