// payments.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { WalletController } from './controllers/wallet.controller';
import { AstrologerPayoutController } from './controllers/astrologer-payout.controller';
import { PaymentWebhookController } from './controllers/payment-webhook.controller';
import { WalletService } from './services/wallet.service';
import { PayoutService } from './services/payout.service';
import { RazorpayService } from './services/razorpay.service';
import { WalletTransaction, WalletTransactionSchema } from './schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestSchema } from './schemas/payout-request.schema';
import { WalletRefundRequest, WalletRefundRequestSchema } from './schemas/wallet-refund-request.schema'; // ADD THIS
import { GiftCard, GiftCardSchema } from './schemas/gift-card.schema'; // ADD THIS
import { StreamSession, StreamSessionSchema } from '../streaming/schemas/stream-session.schema';
import { UsersModule } from '../users/users.module'; 
import { AstrologersModule } from '../astrologers/astrologers.module';
import { GiftService } from './services/gift.service';


@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: WalletRefundRequest.name, schema: WalletRefundRequestSchema }, // ADD THIS
      { name: GiftCard.name, schema: GiftCardSchema }, // ADD THIS
      { name: StreamSession.name, schema: StreamSessionSchema },
    ]),
    UsersModule,
    forwardRef(() => AstrologersModule),
  ],
  controllers: [
    WalletController,
    AstrologerPayoutController,
    PaymentWebhookController,
  ],
  providers: [
    WalletService,
    PayoutService,
    RazorpayService,
    GiftService,
  ],
  exports: [
    WalletService, 
    PayoutService, 
    GiftService,
    MongooseModule, // EXPORT THIS so AdminModule can access the models
  ],
})
export class PaymentsModule {}
