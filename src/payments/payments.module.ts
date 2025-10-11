import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { WalletController } from './controllers/wallet.controller';
import { AstrologerPayoutController } from './controllers/astrologer-payout.controller';
import { PaymentWebhookController } from './controllers/payment-webhook.controller';
import { WalletService } from './services/wallet.service';
import { PayoutService } from './services/payout.service';
import { RazorpayService } from './services/razorpay.service';
import { StripeService } from './services/stripe.service';
import { PayPalService } from './services/paypal.service';
import { WalletTransaction, WalletTransactionSchema } from './schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestSchema } from './schemas/payout-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: PayoutRequest.name, schema: PayoutRequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
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
    StripeService,
    PayPalService,
  ],
  exports: [WalletService, PayoutService],
})
export class PaymentsModule {}
