import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Schemas
import { Admin, AdminSchema } from './schemas/admin.schema';
import { AdminRole, AdminRoleSchema } from './schemas/admin-role.schema';
import { AdminActivityLog, AdminActivityLogSchema } from './schemas/admin-activity-log.schema';

// Import other module schemas
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';
import { Order, OrderSchema } from '../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionSchema } from '../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestSchema } from '../payments/schemas/payout-request.schema';
import { Registration, RegistrationSchema } from '../registration/schemas/registration.schema';

// Controllers
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminRegistrationController } from './controllers/admin-registration.service';
import { AdminAstrologersController } from './controllers/admin-astrologers.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AdminNotificationController } from './controllers/admin-notification.controller';

// Services
import { AdminAuthService } from './services/admin-auth.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminAstrologersService } from './services/admin-astrologers.service';
import { AdminOrdersService } from './services/admin-orders.service';
import { AdminPaymentsService } from './services/admin-payments.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminActivityLogService } from './services/admin-activity-log.service';
import { AdminRegistrationService } from './services/admin-registration.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';

// Import other modules
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

import { AdminManagementController } from './controllers/admin-management.controller';
import { AdminActivityLogsController } from './controllers/admin-activity-logs.controller';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminNotificationGateway } from './gateways/admin-notification.gateway';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Registration.name, schema: RegistrationSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: AdminRole.name, schema: AdminRoleSchema },
      { name: AdminActivityLog.name, schema: AdminActivityLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
    ]),
    PaymentsModule,
    forwardRef(() => require('../notifications/notifications.module').NotificationsModule),
  ],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminAstrologersController,
    AdminOrdersController,
    AdminPaymentsController,
    AdminAnalyticsController,
    AdminManagementController,
    AdminActivityLogsController,
    AdminRegistrationController,
    AdminNotificationController,
  ],
  providers: [
    AdminAuthService,
    AdminUsersService,
    AdminAstrologersService,
    AdminOrdersService,
    AdminPaymentsService,
    AdminAnalyticsService,
    AdminActivityLogService,
    AdminRegistrationService,
    AdminAuthGuard,
    NotificationSchedulerService,
    AdminNotificationGateway,
  ],
  exports: [AdminAuthService, AdminActivityLogService, AdminAuthGuard, JwtModule, NotificationSchedulerService, MongooseModule, AdminNotificationGateway,],
})
export class AdminModule {}
