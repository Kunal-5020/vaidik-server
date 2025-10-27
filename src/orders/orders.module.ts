// src/orders/orders.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { Order, OrderSchema } from './schemas/orders.schema';
import { PaymentsModule } from '../payments/payments.module';
import { AdminModule } from '../admin/admin.module'; // ✅ ADD THIS IF YOU HAVE IT

@Module({
  imports: [ // ✅ ADD THIS
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
    ]),
    PaymentsModule,
    AdminModule, // ✅ ADD THIS - if AdminAuthGuard is exported from AdminModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
