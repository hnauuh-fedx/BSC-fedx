export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  hierarchyLevel: number;
  description: string | null;
  isSystem: boolean;
  status: string;
  permissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  hierarchyLevel: number;
  description: string | null;
  isSystem: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  permissionsByModule: PermissionGroup[];
}
