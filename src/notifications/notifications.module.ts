// notifications/notifications.module.ts (ENHANCED)
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

// Controllers
import { NotificationController } from './controllers/notification.controller';

// Services
import { NotificationService } from './services/notification.service';
import { FcmService } from './services/fcm.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';

// Gateways
import { MobileNotificationGateway } from './gateways/mobile-notification.gateway';

// Schemas
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { ScheduledNotification, ScheduledNotificationSchema } from './schemas/scheduled-notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';


@Module({
  imports: [
    ConfigModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: ScheduledNotification.name, schema: ScheduledNotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
    forwardRef(() => require('../admin/features/notifications/notifications.module').AdminNotificationsModule),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    FcmService,
    NotificationDeliveryService,
    MobileNotificationGateway,
  ],
  exports: [
    NotificationService,
    NotificationDeliveryService,
    MobileNotificationGateway,
    MongooseModule, // Export schemas for Admin Module
  ],
})
export class NotificationsModule {}
