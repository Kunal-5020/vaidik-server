// src/admin/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '../enums/admin-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AdminDocument } from '../schemas/admin.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No specific roles required
    }

    const request = context.switchToHttp().getRequest();
    const admin: AdminDocument = request.admin;

    if (!admin) {
      throw new ForbiddenException('Admin authentication required');
    }

    const hasRole = requiredRoles.includes(admin.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}
