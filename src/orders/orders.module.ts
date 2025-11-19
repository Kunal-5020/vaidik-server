// src/orders/orders.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/orders.schema';
import { OrdersService } from './services/orders.service';
import { OrderPaymentService } from './services/order-payment.service';
import { OrdersController } from './controllers/orders.controller';
import { PaymentsModule } from '../payments/payments.module'; // ✅ IMPORT
import { UsersModule } from '../users/users.module'; // ✅ ADD IF NEEDED
import { AstrologersModule } from '../astrologers/astrologers.module'; // ✅ ADD IF NEEDED
import { WalletTransaction, WalletTransactionSchema } from '../payments/schemas/wallet-transaction.schema'; // ✅ IMPORT SCHEMA
import { User, UserSchema } from '../users/schemas/user.schema'; // ✅ IMPORT SCHEMA
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      // ✅ ALSO REGISTER WALLET TRANSACTION AND USER SCHEMAS HERE
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    PaymentsModule, // ✅ IMPORT PAYMENTS MODULE
    UsersModule, // ✅ IMPORT USERS MODULE
    AstrologersModule, // ✅ IMPORT ASTROLOGERS MODULE
    NotificationsModule, // ✅ IMPORT NOTIFICATIONS MODULE
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderPaymentService],
  exports: [OrdersService, OrderPaymentService],
})
export class OrdersModule {}
