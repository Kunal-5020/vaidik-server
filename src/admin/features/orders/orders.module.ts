// src/admin/features/orders/orders.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { CallSession, CallSessionSchema } from '../../../calls/schemas/call-session.schema'; // ✅ Added
import { ChatSession, ChatSessionSchema } from '../../../chat/schemas/chat-session.schema'; // ✅ Added

import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminOrdersService } from './services/admin-orders.service';

import { CallsModule } from '../../../calls/calls.module';
import { ChatModule } from '../../../chat/chat.module';

import { PaymentsModule } from '../../../payments/payments.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema';

@Module({
  imports: [
    ConfigModule, // ✅ Required
    JwtModule.registerAsync({ // ✅ Required
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: CallSession.name, schema: CallSessionSchema }, // ✅ Added
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
    PaymentsModule,
    CallsModule,
    ChatModule,
    ActivityLogsModule,
    forwardRef(() => require('../../../notifications/notifications.module').NotificationsModule),
  ],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
  exports: [AdminOrdersService],
})
export class OrdersModule {}
