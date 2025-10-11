import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/admin-roles.decorator';
import { AdminDocument } from '../schemas/admin.schema';
import { AdminRoleDocument } from '../schemas/admin-role.schema';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions && !requiredRoles) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const admin: AdminDocument & { roleId: AdminRoleDocument } = request.admin;

    if (!admin) {
      throw new ForbiddenException('Admin not authenticated');
    }

    // Super admins bypass all checks
    if (admin.isSuperAdmin) {
      return true;
    }

    // Check role requirements
    if (requiredRoles && !requiredRoles.includes(admin.roleType)) {
      throw new ForbiddenException('Insufficient role privileges');
    }

    // Check permission requirements
    if (requiredPermissions) {
      const hasPermission = this.checkPermissions(admin, requiredPermissions);
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }

  private checkPermissions(admin: AdminDocument & { roleId: AdminRoleDocument }, requiredPermissions: string[]): boolean {
    // Get all admin permissions
    const rolePermissions = admin.roleId?.permissions || [];
    const customPermissions = admin.customPermissions || [];
    const deniedPermissions = admin.deniedPermissions || [];

    // Combine role and custom permissions
    const allPermissions = [...new Set([...rolePermissions, ...customPermissions])];

    // Remove denied permissions
    const effectivePermissions = allPermissions.filter(p => !deniedPermissions.includes(p));

    // Check if admin has all required permissions
    return requiredPermissions.every(permission => effectivePermissions.includes(permission));
  }
}
