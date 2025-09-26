// src/admin/guards/admin.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { PermissionsGuard } from './permissions.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private authGuard: AdminAuthGuard,
    private permissionsGuard: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First check authentication
    const isAuthenticated = await this.authGuard.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    // Then check permissions
    return this.permissionsGuard.canActivate(context);
  }
}
