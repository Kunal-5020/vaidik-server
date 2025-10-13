// src/admin/controllers/admin-activity-logs.controller.ts
import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminActivityLogService } from '../services/admin-activity-log.service';

@Controller('admin/activity-logs')
@UseGuards(AdminAuthGuard)
export class AdminActivityLogsController {
  constructor(private activityLogService: AdminActivityLogService) {}

  @Get()
  async getActivityLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('module') module?: string,
    @Query('action') action?: string,
  ) {
    return this.activityLogService.getActivityLogs(
      { module, action },
      page,
      limit
    );
  }
}
