// src/admin/features/payments/interfaces/payment-filter.interface.ts
export interface PaymentFilter {
  type?: string;
  status?: string;
  userId?: string;
  astrologerId?: string;
  startDate?: Date;
  endDate?: Date;
}
