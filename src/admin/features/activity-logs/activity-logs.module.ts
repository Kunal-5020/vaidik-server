// src/admin/features/activity-logs/activity-logs.module.ts
import { Module, forwardRef } from '@nestjs/common'; // ✅ Add forwardRef
import { MongooseModule } from '@nestjs/mongoose';

import { AdminActivityLog, AdminActivityLogSchema } from '../../core/schemas/admin-activity-log.schema';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema';

import { AdminActivityLogsController } from './controllers/admin-activity-logs.controller';
import { AdminActivityLogService } from './services/admin-activity-log.service';
import { ActivityLogCleanupService } from './services/activity-log-cleanup.service';

@Module({
  imports: [
    forwardRef(() => require('../auth/auth.module').AuthModule), // ✅ Use forwardRef with require
    MongooseModule.forFeature([
      { name: AdminActivityLog.name, schema: AdminActivityLogSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminActivityLogsController],
  providers: [
    AdminActivityLogService,
    ActivityLogCleanupService,
  ],
  exports: [AdminActivityLogService],
})
export class ActivityLogsModule {}
