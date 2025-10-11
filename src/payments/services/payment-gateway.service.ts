export interface PaymentGatewayResponse {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
  gatewayOrderId?: string;
  clientSecret?: string;
  paymentUrl?: string;
  message?: string;
}

export interface PaymentVerificationResponse {
  success: boolean;
  verified: boolean;
  transactionId: string;
  paymentId: string;
  amount: number;
  status: 'completed' | 'failed';
  message?: string;
}

export abstract class PaymentGatewayService {
  abstract createOrder(
    amount: number,
    currency: string,
    userId: string,
    transactionId: string
  ): Promise<PaymentGatewayResponse>;

  abstract verifyPayment(
    paymentId: string,
    orderId: string,
    signature?: string,
    additionalData?: any
  ): Promise<PaymentVerificationResponse>;

  abstract refundPayment(
    paymentId: string,
    amount: number,
    reason: string
  ): Promise<any>;
}
