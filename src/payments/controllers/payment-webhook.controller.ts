import { Controller, Post, Body, Headers, Req, Res, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { RazorpayService } from '../services/razorpay.service';
import { StripeService } from '../services/stripe.service';
import { PayPalService } from '../services/paypal.service';

@Controller('webhooks/payment')
export class PaymentWebhookController {
  constructor(
    private walletService: WalletService,
    private razorpayService: RazorpayService,
    private stripeService: StripeService,
    private paypalService: PayPalService,
  ) {}

  // Razorpay Webhook
  @Post('razorpay')
  async handleRazorpayWebhook(@Body() payload: any, @Res() res: Response) {
    try {
      // Handle different events
      if (payload.event === 'payment.captured') {
        const payment = payload.payload.payment.entity;
        await this.walletService.verifyPayment(
          payment.notes.transactionId,
          payment.id,
          'completed'
        );
      }
      
      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false });
    }
  }

  // Stripe Webhook
  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response
  ) {
    try {
      const event = this.stripeService.verifyWebhookSignature(
        req.body,
        signature
      );

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        await this.walletService.verifyPayment(
          paymentIntent.metadata.transactionId,
          paymentIntent.id,
          'completed'
        );
      }

      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false });
    }
  }

  // PayPal Webhook
  @Post('paypal')
  async handlePayPalWebhook(@Body() payload: any, @Res() res: Response) {
    try {
      if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const resource = payload.resource;
        await this.walletService.verifyPayment(
          resource.custom_id,
          resource.id,
          'completed'
        );
      }

      return res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false });
    }
  }
}
