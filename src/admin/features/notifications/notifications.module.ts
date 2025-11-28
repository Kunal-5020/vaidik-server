// src/admin/features/notifications/notifications.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt'; // ✅ Add
import { ConfigModule, ConfigService } from '@nestjs/config'; // ✅ Add

import { ScheduledNotification, ScheduledNotificationSchema } from '../../../notifications/schemas/scheduled-notification.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema'; // ✅ Add

import { AdminNotificationController } from './controllers/admin-notification.controller';
import { NotificationSchedulerService } from './services/notification-scheduler.service';
import { AdminNotificationGateway } from './gateways/admin-notification.gateway';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [
    ConfigModule, // ✅ Add
    JwtModule.registerAsync({ // ✅ Add
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: ScheduledNotification.name, schema: ScheduledNotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: Admin.name, schema: AdminSchema }, // ✅ Add
    ]),
    ActivityLogsModule,
    forwardRef(() => require('../../../notifications/notifications.module').NotificationsModule),
  ],
  controllers: [AdminNotificationController],
  providers: [
    NotificationSchedulerService,
    AdminNotificationGateway,
  ],
  exports: [
    NotificationSchedulerService,
    AdminNotificationGateway,
  ],
})
export class AdminNotificationsModule {}
