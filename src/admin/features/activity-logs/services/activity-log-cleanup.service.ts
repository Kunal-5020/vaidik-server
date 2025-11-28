// src/admin/features/activity-logs/services/activity-log-cleanup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminActivityLogService } from './admin-activity-log.service';

@Injectable()
export class ActivityLogCleanupService {
  private readonly logger = new Logger(ActivityLogCleanupService.name);

  constructor(private activityLogService: AdminActivityLogService) {}

  /**
   * Run cleanup every day at 2 AM
   * Deletes logs older than 90 days
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleLogCleanup() {
    this.logger.log('Starting activity log cleanup...');
    
    try {
      const result = await this.activityLogService.deleteOldLogs(90);
      this.logger.log(`Log cleanup completed. Deleted ${result.deletedCount} old logs.`);
    } catch (error) {
      this.logger.error(`Log cleanup failed: ${error.message}`, error.stack);
    }
  }
}
