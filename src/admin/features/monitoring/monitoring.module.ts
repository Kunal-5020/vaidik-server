// src/admin/features/monitoring/monitoring.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ShopifyOrderEntity, ShopifyOrderSchema } from '../../../shopify/schemas/shopify-order.schema';
import { Remedy, RemedySchema } from '../../../remedies/schemas/remedies.schema';
import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { WalletTransaction, WalletTransactionSchema } from '../../../payments/schemas/wallet-transaction.schema';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema'; // ✅ Add this

import { AdminMonitoringController } from './controllers/admin-monitoring.controller';
import { AdminMonitoringService } from './services/admin-monitoring.service';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ShopifyOrderEntity.name, schema: ShopifyOrderSchema },
      { name: Remedy.name, schema: RemedySchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Admin.name, schema: AdminSchema }, // ✅ Add this
    ]),
    ActivityLogsModule,
  ],
  controllers: [AdminMonitoringController],
  providers: [AdminMonitoringService],
  exports: [AdminMonitoringService],
})
export class MonitoringModule {}
