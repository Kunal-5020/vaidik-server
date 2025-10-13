import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay'; // ✅ Fix: Use default import
import * as crypto from 'crypto';
import { PaymentGatewayService, PaymentGatewayResponse, PaymentVerificationResponse } from './payment-gateway.service';

@Injectable()
export class RazorpayService extends PaymentGatewayService {
  private razorpay: Razorpay;

  constructor(private configService: ConfigService) {
    super();
    // ✅ Fix: Provide default values or use non-null assertion
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID') || 'rzp_test_pgNwN5gpPzbjfq',
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET') || 'FZL5DUSe4qspQ7TUDCmP3Ua9',
    });
  }

  async createOrder(
    amount: number,
    currency: string,
    userId: string,
    transactionId: string
  ): Promise<PaymentGatewayResponse> {
    try {
      const options = {
        amount: amount * 100, // Razorpay expects amount in paise
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
        message: 'Razorpay order created successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Razorpay order creation failed: ${error.message}`);
    }
  }

  async verifyPayment(
    paymentId: string,
    orderId: string,
    signature: string
  ): Promise<PaymentVerificationResponse> {
    try {
      const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';
      
      // Generate signature
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const isValid = generatedSignature === signature;

      if (!isValid) {
        return {
          success: false,
          verified: false,
          transactionId: orderId,
          paymentId,
          amount: 0,
          status: 'failed',
          message: 'Payment signature verification failed'
        };
      }

      // ✅ Fix: Fetch payment details from Razorpay with proper typing
      const payment: any = await this.razorpay.payments.fetch(paymentId);

      // ✅ Fix: Safe access to payment properties
      const paymentAmount = typeof payment.amount === 'number' ? payment.amount : 0;
      const transactionId = payment.notes?.transactionId || orderId;

      return {
        success: true,
        verified: true,
        transactionId: payment.notes.transactionId,
        paymentId: payment.id,
        amount: payment.amount / 100, // Convert paise to rupees
        status: payment.status === 'captured' ? 'completed' : 'failed',
        message: 'Payment verified successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Payment verification failed: ${error.message}`);
    }
  }

  async refundPayment(paymentId: string, amount: number, reason: string): Promise<any> {
    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: amount * 100, // Amount in paise
        notes: { reason },
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount ? refund.amount / 100 : 0,
        status: refund.status,
        message: 'Refund processed successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }
}
