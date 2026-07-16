export const ADMINISTRATION_DESTINATIONS = [
  {
    permissions: ['user.view'],
    label: 'Người dùng',
    description: 'Quản lý tài khoản, trạng thái và quan hệ quản lý.',
    href: '/management/users',
  },
  {
    permissions: ['department.view'],
    label: 'Đơn vị',
    description: 'Quản lý cơ cấu đơn vị và phòng ban.',
    href: '/management/departments',
  },
  {
    permissions: ['position.view'],
    label: 'Chức danh',
    description: 'Quản lý danh mục chức danh trong tổ chức.',
    href: '/management/positions',
  },
] as const;

export const ADMINISTRATION_CAPABILITIES = [
  { permissions: ['user.create', 'user.update', 'user.lock', 'user.password.reset'], label: 'Thao tác người dùng' },
  { permissions: ['department.manage'], label: 'Quản lý đơn vị' },
  { permissions: ['position.manage'], label: 'Quản lý chức danh' },
  { permissions: ['role.view', 'role.manage'], label: 'Vai trò' },
  { permissions: ['permission.view', 'permission.assign'], label: 'Phân quyền' },
  { permissions: ['bsc.period.view', 'bsc.period.manage'], label: 'Kỳ BSC' },
  { permissions: ['bsc.template.view', 'bsc.template.manage'], label: 'Mẫu BSC' },
  { permissions: ['audit.view'], label: 'Nhật ký hệ thống' },
] as const;

export const ADMINISTRATION_PERMISSIONS: readonly string[] = [
  ...ADMINISTRATION_DESTINATIONS,
  ...ADMINISTRATION_CAPABILITIES,
].flatMap(item => [...item.permissions]);

export const hasAnyPermission = (owned: readonly string[], required: readonly string[]): boolean =>
  required.some(permission => owned.includes(permission));
