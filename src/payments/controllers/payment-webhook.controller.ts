import { Controller, Post, Body, Headers, Req, Res, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WalletService } from '../services/wallet.service';
import { RazorpayService } from '../services/razorpay.service';

@Controller('webhooks/payment')
export class PaymentWebhookController {
  constructor(
    private walletService: WalletService,
    private razorpayService: RazorpayService,
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

}
