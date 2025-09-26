// src/admin/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission, AdminRole } from '../enums/admin-role.enum';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { hasPermission } from '../config/admin-permissions.config';
import { AdminDocument } from '../schemas/admin.schema';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const admin: AdminDocument = request.admin;

    if (!admin) {
      throw new ForbiddenException('Admin authentication required');
    }

    // Check if admin has any of the required permissions
    const hasRequiredPermission = requiredPermissions.some(permission =>
      hasPermission(admin.role, admin.permissions, permission)
    );

    if (!hasRequiredPermission) {
      throw new ForbiddenException(
        `Access denied. Required permissions: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}
