// src/admin/decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '../enums/admin-role.enum';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Usage: @RequirePermissions(AdminPermission.MANAGE_USERS)
