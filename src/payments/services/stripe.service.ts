import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentGatewayService, PaymentGatewayResponse, PaymentVerificationResponse } from './payment-gateway.service';

@Injectable()
export class StripeService extends PaymentGatewayService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    super();
    // ✅ Fix: Provide default value or use non-null assertion
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    this.stripe = new Stripe(secretKey, { 
      apiVersion: '2024-10-28' as any 
    });
  }

  async createOrder(
    amount: number,
    currency: string,
    userId: string,
    transactionId: string
  ): Promise<PaymentGatewayResponse> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amount * 100, // Stripe expects amount in cents
        currency: currency || 'usd',
        metadata: {
          userId,
          transactionId,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        orderId: transactionId,
        amount: amount,
        currency: currency || 'usd',
        gatewayOrderId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || undefined, // ✅ Fix: Convert null to undefined
        message: 'Stripe payment intent created successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Stripe payment creation failed: ${error.message}`);
    }
  }

  async verifyPayment(
    paymentId: string,
    orderId?: string,
    signature?: string,
    eventData?: any
  ): Promise<PaymentVerificationResponse> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentId);

      return {
        success: true,
        verified: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.metadata.transactionId,
        paymentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        status: paymentIntent.status === 'succeeded' ? 'completed' : 'failed',
        message: 'Payment verified successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Payment verification failed: ${error.message}`);
    }
  }

  async refundPayment(paymentId: string, amount: number, reason: string): Promise<any> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentId,
        amount: amount * 100,
        reason: 'requested_by_customer',
        metadata: { reason },
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        message: 'Refund processed successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload: Buffer, signature: string): any {
    try {
      const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error: any) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}
