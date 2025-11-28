// src/admin/features/activity-logs/controllers/admin-activity-logs.controller.ts
import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  DefaultValuePipe, 
  ParseIntPipe,
  ValidationPipe 
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { Permissions } from '../../../core/config/permissions.config';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';

import { AdminActivityLogService } from '../services/admin-activity-log.service';
import { ActivityLogQueryDto } from '../dto/activity-log-query.dto';

@Controller('admin/activity-logs')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminActivityLogsController {
  constructor(private activityLogService: AdminActivityLogService) {}

  /**
   * GET /admin/activity-logs
   * Get all activity logs with filters
   */
  @Get()
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getActivityLogs(
    @Query(ValidationPipe) queryDto: ActivityLogQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = {
      adminId: queryDto.adminId,
      action: queryDto.action,
      module: queryDto.module,
      status: queryDto.status,
      startDate: queryDto.startDate ? new Date(queryDto.startDate) : undefined,
      endDate: queryDto.endDate ? new Date(queryDto.endDate) : undefined,
    };

    return this.activityLogService.getActivityLogs(filters, page, limit);
  }

  /**
   * GET /admin/activity-logs/my-activities
   * Get current admin's own activity logs
   */
  @Get('my-activities')
  async getMyActivities(
    @CurrentAdmin() admin: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = {
      adminId: String(admin._id),
    };

    return this.activityLogService.getActivityLogs(filters, page, limit);
  }

  /**
   * GET /admin/activity-logs/stats
   * Get activity statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getActivityStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return this.activityLogService.getActivityStats(filters);
  }

  /**
   * GET /admin/activity-logs/recent
   * Get recent activities (last 24 hours)
   */
  @Get('recent')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getRecentActivities(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const filters = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    };

    return this.activityLogService.getActivityLogs(filters, 1, limit);
  }

  /**
   * GET /admin/activity-logs/by-admin/:adminId
   * Get activity logs for a specific admin
   */
  @Get('by-admin/:adminId')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getActivitiesByAdmin(
    @Query('adminId') adminId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = { adminId };
    return this.activityLogService.getActivityLogs(filters, page, limit);
  }

  /**
   * GET /admin/activity-logs/by-module/:module
   * Get activity logs filtered by module
   */
  @Get('by-module/:module')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getActivitiesByModule(
    @Query('module') module: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = { module };
    return this.activityLogService.getActivityLogs(filters, page, limit);
  }

  /**
   * GET /admin/activity-logs/failed
   * Get failed activity logs
   */
  @Get('failed')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getFailedActivities(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = { status: 'failed' as 'success' | 'failed' | 'warning' };
    return this.activityLogService.getActivityLogs(filters, page, limit);
  }
}
