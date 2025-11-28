// src/admin/features/analytics/controllers/admin-analytics.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { Permissions } from '../../../core/config/permissions.config';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@Controller('admin/analytics')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAnalyticsController {
  constructor(private analyticsService: AdminAnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions(Permissions.ANALYTICS_VIEW)
  async getDashboardAnalytics() {
    return this.analyticsService.getDashboardAnalytics();
  }
}
