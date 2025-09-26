// src/admin/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../enums/admin-role.enum';

export const ROLES_KEY = 'roles';
export const RequireRoles = (...roles: AdminRole[]) =>
  SetMetadata(ROLES_KEY, roles);

// Usage: @RequireRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
