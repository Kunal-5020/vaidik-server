// src/admin/features/analytics/analytics.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt'; // ✅ Add this
import { ConfigModule, ConfigService } from '@nestjs/config'; // ✅ Add this

import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionSchema } from '../../../payments/schemas/wallet-transaction.schema';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema'; // ✅ Add this
import { CallSession, CallSessionSchema } from '../../../calls/schemas/call-session.schema'; // ✅ Added
import { ChatSession, ChatSessionSchema } from '../../../chat/schemas/chat-session.schema'; // ✅ Added

import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AdminAnalyticsService } from './services/admin-analytics.service';

@Module({
  imports: [
    ConfigModule, // ✅ Add this
    // ✅ Add JwtModule
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Admin.name, schema: AdminSchema }, // ✅ Add this
      { name: CallSession.name, schema: CallSessionSchema }, // ✅ Added for DI
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
  ],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService],
  exports: [AdminAnalyticsService],
})
export class AnalyticsModule {}
