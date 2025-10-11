import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { Permissions } from '../constants/permissions';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@Controller('admin/analytics')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAnalyticsController {
  constructor(private adminAnalyticsService: AdminAnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions(Permissions.ANALYTICS_VIEW)
  async getDashboardStats() {
    return this.adminAnalyticsService.getDashboardStats();
  }

  @Get('revenue')
  @RequirePermissions(Permissions.ANALYTICS_FINANCIAL)
  async getRevenueAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy?: string
  ) {
    return this.adminAnalyticsService.getRevenueAnalytics(
      new Date(startDate),
      new Date(endDate),
      groupBy
    );
  }

  @Get('top-astrologers')
  @RequirePermissions(Permissions.ANALYTICS_VIEW)
  async getTopAstrologers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.adminAnalyticsService.getTopAstrologers(limit);
  }

  @Get('user-growth')
  @RequirePermissions(Permissions.ANALYTICS_VIEW)
  async getUserGrowth(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return this.adminAnalyticsService.getUserGrowth(
      new Date(startDate),
      new Date(endDate)
    );
  }

  @Get('performance')
  @RequirePermissions(Permissions.ANALYTICS_VIEW)
  async getPerformanceMetrics() {
    return this.adminAnalyticsService.getPerformanceMetrics();
  }
}
