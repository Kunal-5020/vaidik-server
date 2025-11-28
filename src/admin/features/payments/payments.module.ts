// src/admin/features/payments/payments.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { WalletTransaction, WalletTransactionSchema } from '../../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestSchema } from '../../../payments/schemas/payout-request.schema';
import { WalletRefundRequest, WalletRefundRequestSchema } from '../../../payments/schemas/wallet-refund-request.schema';
import { GiftCard, GiftCardSchema } from '../../../payments/schemas/gift-card.schema';

import { AdminPaymentsController } from './controllers/admin-payments.controller';
import { AdminPaymentsService } from './services/admin-payments.service';

import { PaymentsModule as MainPaymentsModule } from '../../../payments/payments.module';
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
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: WalletRefundRequest.name, schema: WalletRefundRequestSchema },
      { name: GiftCard.name, schema: GiftCardSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
    MainPaymentsModule,
    ActivityLogsModule,
    forwardRef(() => require('../../../notifications/notifications.module').NotificationsModule),
  ],
  controllers: [AdminPaymentsController],
  providers: [AdminPaymentsService],
  exports: [AdminPaymentsService],
})
export class AdminPaymentsFeatureModule {}
