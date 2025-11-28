import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Schemas
import { SupportTicket, SupportTicketSchema } from './schemas/support-ticket.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';
import { WalletTransaction, WalletTransactionSchema } from '../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestSchema } from '../payments/schemas/payout-request.schema';

// Services
import { ZohoDeskService } from './services/zoho-desk.service';
import { RazorpayService } from '../payments/services/razorpay.service';
import { WalletService } from '../payments/services/wallet.service';

// Controllers
import { SupportController } from './controllers/support.controller';
import { AdminSupportController } from './controllers/admin-support.controller';
import { ZohoWebhookController } from './controllers/zoho-webhook.controller';

import { PaymentsModule } from 'src/payments/payments.module';
import { AdminModule } from 'src/admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
    ]),
    PaymentsModule,
    AdminModule,
  ],
  controllers: [
    SupportController,
    AdminSupportController,
    ZohoWebhookController,
  ],
  providers: [
    ZohoDeskService,
    RazorpayService,
    WalletService,
  ],
  exports: [ZohoDeskService],
})
export class SupportModule {}
