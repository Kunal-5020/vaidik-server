// src/admin/features/orders/interfaces/order-filter.interface.ts
export interface OrderFilter {
  status?: string;
  type?: string;
  userId?: string;
  astrologerId?: string;
  startDate?: Date;
  endDate?: Date;
}
