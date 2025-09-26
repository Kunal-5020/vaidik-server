// src/admin/controllers/admin-dashboard.controller.ts (Fixed)
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminPermission } from '../enums/admin-role.enum';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminDocument } from '../schemas/admin.schema'; // Fix: Use import type
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(private adminAnalyticsService: AdminAnalyticsService) {}

  @Get('stats')
  @RequirePermissions(AdminPermission.VIEW_ANALYTICS)
  async getDashboardStats(@CurrentAdmin() admin: AdminDocument) {
    return {
      success: true,
      data: await this.adminAnalyticsService.getDashboardStats(),
    };
  }

  @Get('profile')
  async getProfile(@CurrentAdmin() admin: AdminDocument) {
    return {
      success: true,
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }
}
