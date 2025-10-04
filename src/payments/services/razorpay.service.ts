// src/payments/services/razorpay.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  environment: 'test' | 'live';
}

export interface CreateOrderOptions {
  amount: number; // Amount in paise
  currency: string;
  receipt: string;
  notes?: Record<string, any>;
}

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private razorpayInstance: Razorpay;
  private config: RazorpayConfig;
  private isDevelopment: boolean;

  constructor(private configService: ConfigService) {
    this.isDevelopment = this.configService.get('NODE_ENV') !== 'production';
    
    // Initialize configuration
    this.config = {
      keyId: this.configService.get('RAZORPAY_KEY_ID') || 'rzp_test_mock',
      keySecret: this.configService.get('RAZORPAY_KEY_SECRET') || 'mock_secret',
      webhookSecret: this.configService.get('RAZORPAY_WEBHOOK_SECRET'),
      environment: this.configService.get('RAZORPAY_ENVIRONMENT') || 'test',
    };

    // Initialize Razorpay instance
    if (this.hasValidCredentials() && !this.isDevelopment) {
      this.razorpayInstance = new Razorpay({
        key_id: this.config.keyId,
        key_secret: this.config.keySecret,
      });
      this.logger.log(`✅ Razorpay initialized with ${this.config.environment} credentials`);
    } else {
      this.logger.warn('⚠️ Razorpay running in MOCK mode (development/invalid credentials)');
    }
  }

  /**
   * Check if Razorpay credentials are properly configured
   */
  private hasValidCredentials(): boolean {
    return !!(
      this.config.keyId && 
      this.config.keyId !== 'rzp_test_mock' &&
      this.config.keySecret && 
      this.config.keySecret !== 'mock_secret'
    );
  }

  /**
   * Create a Razorpay order
   */
  async createOrder(options: CreateOrderOptions): Promise<RazorpayOrder> {
    const { amount, currency, receipt, notes } = options;

    try {
      // Development/Mock mode
      if (this.isDevelopment || !this.hasValidCredentials()) {
        const mockOrder: RazorpayOrder = {
          id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          entity: 'order',
          amount,
          amount_paid: 0,
          amount_due: amount,
          currency,
          receipt,
          status: 'created',
          attempts: 0,
          notes: notes || {},
          created_at: Math.floor(Date.now() / 1000),
        };

        this.logger.log(`🔧 Mock order created: ${mockOrder.id} for ₹${amount / 100}`);
        return mockOrder;
      }

      // Production mode with real Razorpay
      const order = await this.razorpayInstance.orders.create({
        amount,
        currency,
        receipt,
        notes,
      });

      this.logger.log(`✅ Razorpay order created: ${order.id} for ₹${amount / 100}`);
      return order as RazorpayOrder;

    } catch (error) {
      this.logger.error(`❌ Failed to create Razorpay order: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create payment order');
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    try {
      // Skip verification in development mode
      if (this.isDevelopment || !this.hasValidCredentials()) {
        this.logger.log('🔧 Skipping signature verification in development mode');
        return true;
      }

      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.keySecret)
        .update(body.toString())
        .digest('hex');

      const isValid = expectedSignature === signature;
      
      if (isValid) {
        this.logger.log(`✅ Payment signature verified for order: ${orderId}`);
      } else {
        this.logger.warn(`❌ Invalid payment signature for order: ${orderId}`);
      }

      return isValid;

    } catch (error) {
      this.logger.error(`❌ Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get payment details from Razorpay
   */
  async getPaymentDetails(paymentId: string): Promise<any> {
    try {
      if (this.isDevelopment || !this.hasValidCredentials()) {
        // Return mock payment details
        return {
          id: paymentId,
          entity: 'payment',
          amount: 0,
          currency: 'INR',
          status: 'captured',
          method: 'card',
          description: 'Mock payment (development mode)',
          created_at: Math.floor(Date.now() / 1000),
        };
      }

      const payment = await this.razorpayInstance.payments.fetch(paymentId);
      return payment;

    } catch (error) {
      this.logger.error(`❌ Failed to fetch payment details: ${error.message}`);
      throw new BadRequestException('Payment not found');
    }
  }

  /**
   * Process refund
   */
  async processRefund(paymentId: string, amount?: number): Promise<any> {
    try {
      if (this.isDevelopment || !this.hasValidCredentials()) {
        const mockRefund = {
          id: `rfnd_mock_${Date.now()}`,
          entity: 'refund',
          amount: amount || 0,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: Math.floor(Date.now() / 1000),
        };

        this.logger.log(`🔧 Mock refund processed: ${mockRefund.id}`);
        return mockRefund;
      }

      const refundOptions: any = { payment_id: paymentId };
      if (amount) {
        refundOptions.amount = amount;
      }

      const refund = await this.razorpayInstance.payments.refund(paymentId, refundOptions);
      this.logger.log(`✅ Refund processed: ${refund.id} for payment: ${paymentId}`);
      
      return refund;

    } catch (error) {
      this.logger.error(`❌ Refund failed: ${error.message}`);
      throw new BadRequestException('Refund processing failed');
    }
  }

  /**
   * Get Razorpay configuration for frontend
   */
  getClientConfig(): { keyId: string; environment: string; isEnabled: boolean } {
    return {
      keyId: this.config.keyId,
      environment: this.config.environment,
      isEnabled: this.hasValidCredentials() || this.isDevelopment,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      this.logger.warn('Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{ status: string; mode: string; hasCredentials: boolean }> {
    return {
      status: 'healthy',
      mode: this.isDevelopment ? 'development' : 'production',
      hasCredentials: this.hasValidCredentials(),
    };
  }
}
