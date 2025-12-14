// notifications/notifications.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config'; // 1. Import ConfigService
import { JwtModule } from '@nestjs/jwt';

// Controllers
import { NotificationController } from './controllers/notification.controller';

// Services
import { NotificationService } from './services/notification.service';
import { FcmService } from './services/fcm.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';

// Gateways
import { MobileNotificationGateway } from './gateways/mobile-notification.gateway';
import { WebNotificationGateway } from './gateways/web-notification.gateway';

// Schemas
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { ScheduledNotification, ScheduledNotificationSchema } from './schemas/scheduled-notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';

@Module({
  imports: [
    ConfigModule,
    // 2. Use registerAsync to ensure JWT_SECRET is loaded correctly
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
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
    WebNotificationGateway,
  ],
  exports: [
    NotificationService,
    NotificationDeliveryService,
    MobileNotificationGateway,
    MongooseModule,
  ],
})
export class NotificationsModule {}