import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminReportsService } from './services/admin-reports.service';

import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionSchema } from '../../../payments/schemas/wallet-transaction.schema';

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
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminReportsController],
  providers: [AdminReportsService],
  exports: [AdminReportsService],
})
export class AdminReportsModule {}
