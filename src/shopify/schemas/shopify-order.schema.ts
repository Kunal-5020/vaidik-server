import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ShopifyOrderDocument = ShopifyOrderEntity & Document;

@Schema({
  timestamps: true,
  collection: 'shopify_orders',
})
export class ShopifyOrderEntity {
  @Prop({ required: true, unique: true, index: true })
  shopifyOrderId: number;

  @Prop({ required: true })
  orderNumber: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  shopifyCustomerId: number;

  // Customer details
  @Prop({ required: true, index: true })
  customerPhone: string;

  @Prop({ required: true })
  customerEmail: string;

  @Prop({ required: true })
  customerName: string;

  // Order details - ✅ FIXED: Explicit type for array
  @Prop({
    type: [
      {
        productId: { type: Number, default: null },
        variantId: { type: Number, default: null },
        productName: String,
        quantity: Number,
        price: String,
        sku: { type: String, default: null },
      },
    ],
    default: [],
  })
  lineItems: Array<{
    productId: number | null;
    variantId: number | null;
    productName: string;
    quantity: number;
    price: string;
    sku: string | null;
  }>;

  // Status & payment - ✅ FIXED: Explicit String type
  @Prop({ required: true, type: String })
  financialStatus: string;

  @Prop({ type: String, default: null }) // ✅ FIXED: Explicit type
  fulfillmentStatus: string | null;

  @Prop({ required: true, type: String })
  totalPrice: string;

  @Prop({ required: true, default: '0', type: String })
  totalTax: string;

  @Prop({ required: true, type: String })
  currency: string;

  @Prop({ type: String, default: null })
  shopifyProductId?: string; // Shopify product ID if it's a product remedy

  @Prop({ type: Date, default: null })
  purchasedAt?: Date; // When user purchased from Shopify

  @Prop({ type: Boolean, default: false })
  isPurchased: boolean; // Track if user bought it

  // Shopify timestamps
  @Prop({ required: true, type: Date })
  shopifyCreatedAt: Date;

  @Prop({ required: true, type: Date })
  shopifyUpdatedAt: Date;

  // Sync timestamp
  @Prop({ default: () => new Date(), type: Date })
  syncedAt: Date;

  // Metadata - ✅ FIXED: Explicit type
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: false, index: true, type: Boolean })
  isDeleted: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date;
}

export const ShopifyOrderSchema = SchemaFactory.createForClass(
  ShopifyOrderEntity,
);

// Indexes for performance
// Unique index for shopifyOrderId is created via @Prop({ unique: true })
ShopifyOrderSchema.index(
  { userId: 1, customerPhone: 1, shopifyCreatedAt: -1 },
);
ShopifyOrderSchema.index({ shopifyCustomerId: 1, isDeleted: 1 });
ShopifyOrderSchema.index({ customerPhone: 1, isDeleted: 1 });
ShopifyOrderSchema.index({ financialStatus: 1, fulfillmentStatus: 1 });
