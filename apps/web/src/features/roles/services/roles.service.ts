import { httpClient } from '../../../lib/http-client';
import type { RoleSummary, RoleDetail, PermissionGroup } from '../types/roles.types';

export const rolesApi = {
  /** GET /roles — danh sách tất cả roles */
  list: () => httpClient.get<RoleSummary[]>('/roles'),

  /** GET /roles/:id — chi tiết role với permissions grouped by module */
  detail: (id: string) => httpClient.get<RoleDetail>(`/roles/${id}`),

  /** GET /permissions — tất cả permissions available */
  allPermissions: () => httpClient.get<PermissionGroup[]>('/permissions'),

  /** PUT /roles/:id/permissions — cập nhật permission IDs của role */
  updatePermissions: (roleId: string, permissionIds: string[]) =>
    httpClient.put<RoleDetail>(`/roles/${roleId}/permissions`, { permissionIds }),
};
