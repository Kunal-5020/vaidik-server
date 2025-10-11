import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PaymentGatewayService, PaymentGatewayResponse, PaymentVerificationResponse } from './payment-gateway.service';

@Injectable()
export class PayPalService extends PaymentGatewayService {
  private baseURL: string;
  private clientId: string;
  private clientSecret: string;

  constructor(private configService: ConfigService) {
    super();
    // ✅ Fix: Use non-null assertion or provide default values
    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
    this.baseURL = this.configService.get<string>('PAYPAL_MODE') === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
    
    // Validate credentials
    if (!this.clientId || !this.clientSecret) {
      console.warn('PayPal credentials not configured');
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await axios.post(
        `${this.baseURL}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      return response.data.access_token;
    } catch (error: any) {
      throw new BadRequestException('Failed to get PayPal access token');
    }
  }

  async createOrder(
    amount: number,
    currency: string,
    userId: string,
    transactionId: string
  ): Promise<PaymentGatewayResponse> {
    try {
      const accessToken = await this.getAccessToken();

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: transactionId,
          amount: {
            currency_code: currency || 'USD',
            value: amount.toFixed(2),
          },
          custom_id: userId,
        }],
        application_context: {
          return_url: this.configService.get<string>('PAYPAL_RETURN_URL') || 'https://yourapp.com/payment/success',
          cancel_url: this.configService.get<string>('PAYPAL_CANCEL_URL') || 'https://yourapp.com/payment/cancel',
        },
      };

      const response = await axios.post(
        `${this.baseURL}/v2/checkout/orders`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const approvalUrl = response.data.links.find((link: any) => link.rel === 'approve')?.href;

      return {
        success: true,
        orderId: transactionId,
        amount: amount,
        currency: currency || 'USD',
        gatewayOrderId: response.data.id,
        paymentUrl: approvalUrl,
        message: 'PayPal order created successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`PayPal order creation failed: ${error.message}`);
    }
  }

  async verifyPayment(
    paymentId: string,
    orderId?: string
  ): Promise<PaymentVerificationResponse> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseURL}/v2/checkout/orders/${paymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const order = response.data;
      const isCompleted = order.status === 'COMPLETED';

      return {
        success: true,
        verified: isCompleted,
        transactionId: order.purchase_units[0].reference_id,
        paymentId: order.id,
        amount: parseFloat(order.purchase_units[0].amount.value),
        status: isCompleted ? 'completed' : 'failed',
        message: 'Payment verified successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Payment verification failed: ${error.message}`);
    }
  }

  async refundPayment(captureId: string, amount: number, reason: string): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseURL}/v2/payments/captures/${captureId}/refund`,
        {
          amount: {
            value: amount.toFixed(2),
            currency_code: 'USD',
          },
          note_to_payer: reason,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        refundId: response.data.id,
        amount: parseFloat(response.data.amount.value),
        status: response.data.status,
        message: 'Refund processed successfully'
      };
    } catch (error: any) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }
}
