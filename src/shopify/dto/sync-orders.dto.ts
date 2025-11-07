import { IsString, IsNotEmpty, IsPhoneNumber, IsOptional, IsNumber } from 'class-validator';

export class SyncShopifyOrdersDto {
  @IsString()
  @IsNotEmpty()
  userPhone: string; // User's phone to search in Shopify

  @IsOptional()
  @IsNumber()
  limit?: number; // Number of orders to fetch (default: 100)
}

export class SyncShopifyOrdersResponseDto {
  success: boolean;
  message: string;
  data: {
    customer: {
      shopifyCustomerId: number;
      name: string;
      email: string;
      phone: string;
    };
    orders: Array<{
      shopifyOrderId: number;
      orderNumber: string;
      createdAt: string;
      totalPrice: string;
      currency: string;
      status: string;
      lineItems: Array<{
        productName: string;
        quantity: number;
        price: string;
      }>;
    }>;
    syncedCount: number;
    totalOrders: number;
  };
}
