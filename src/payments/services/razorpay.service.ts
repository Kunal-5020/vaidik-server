import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay'; // ✅ Fix: Use default import
import * as crypto from 'crypto';

export interface RazorpayOrderResponse {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
  gatewayOrderId?: string;
  message?: string;
}

export interface RazorpayVerificationResponse {
  success: boolean;
  verified: boolean;
  transactionId: string;
  paymentId: string;
  amount: number;
  status: 'completed' | 'failed';
  message?: string;
}

@Injectable()
export class RazorpayService {
  private razorpay: Razorpay;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(private configService: ConfigService) {
    this.keyId =
      this.configService.get<string>('RAZORPAY_KEY_ID') ||
      'rzp_test_pgNwN5gpPzbjfq';
    this.keySecret =
      this.configService.get<string>('RAZORPAY_KEY_SECRET') ||
      'FZL5DUSe4qspQ7TUDCmP3Ua9';
    this.webhookSecret =
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';

    this.razorpay = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  // ✅ Get Key ID (for frontend)
  getKeyId(): string {
    return this.keyId;
  }

  // ===== CREATE ORDER =====

  async createOrder(
    amount: number,
    currency: string,
    userId: string,
    transactionId: string,
  ): Promise<RazorpayOrderResponse> {
    try {
      const options = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: currency || 'INR',
        receipt: transactionId,
        notes: {
          userId,
          transactionId,
        },
      };

      const order = await this.razorpay.orders.create(options);

      return {
        success: true,
        orderId: transactionId,
        amount: amount,
        currency: currency || 'INR',
        gatewayOrderId: order.id,
        message: 'Razorpay order created successfully',
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Razorpay order creation failed: ${error.message}`,
      );
    }
  }

  // ===== VERIFY PAYMENT SIGNATURE =====

  verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): boolean {
    try {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      return generatedSignature === razorpaySignature;
    } catch (error) {
      return false;
    }
  }

  // ===== VERIFY PAYMENT =====

  async verifyPayment(
    paymentId: string,
    orderId: string,
    signature: string,
  ): Promise<RazorpayVerificationResponse> {
    try {
      const isValid = this.verifyPaymentSignature(orderId, paymentId, signature);

      if (!isValid) {
        return {
          success: false,
          verified: false,
          transactionId: orderId,
          paymentId,
          amount: 0,
          status: 'failed',
          message: 'Payment signature verification failed',
        };
      }

      // Fetch payment details from Razorpay
      const payment: any = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        verified: true,
        transactionId: payment.notes?.transactionId || orderId,
        paymentId: payment.id,
        amount: payment.amount / 100, // Convert paise to rupees
        status: payment.status === 'captured' ? 'completed' : 'failed',
        message: 'Payment verified successfully',
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Payment verification failed: ${error.message}`,
      );
    }
  }

  // ===== VERIFY WEBHOOK SIGNATURE =====

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    try {
      if (!this.webhookSecret) {
        console.warn(
          '⚠️  RAZORPAY_WEBHOOK_SECRET not configured. Skipping webhook verification.',
        );
        return true; // Allow in development if not configured
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  // ===== REFUND PAYMENT =====

  async refundPayment(
    paymentId: string,
    amount: number,
    reason: string,
  ): Promise<any> {
    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: Math.round(amount * 100), // Amount in paise
        notes: { reason },
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount ? refund.amount / 100 : 0,
        status: refund.status,
        message: 'Refund processed successfully',
      };
    } catch (error: any) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  // ===== FETCH PAYMENT DETAILS =====

  async fetchPayment(paymentId: string): Promise<any> {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to fetch payment: ${error.message}`,
      );
    }
  }
}