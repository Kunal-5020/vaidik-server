import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RemedyDocument = Remedy & Document;

@Schema({ timestamps: true, collection: 'remedies' })
export class Remedy {
  @Prop({ required: true, unique: true, index: true })
  remedyId: string; // "REM_20251106_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId; // User who needs remedy

  @Prop({ required: true, index: true })
  orderId: string; // Specific consultation order (ORD_...)

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId; // Who suggested

  @Prop({ required: true })
  astrologerName: string;

  // ===== REMEDY SOURCE (CRITICAL) =====
  @Prop({
    required: true,
    enum: ['manual', 'shopify_product'],
    default: 'manual',
    index: true,
  })
  remedySource: string; // manual or shopify_product

  // ===== MANUAL TEXT REMEDY =====
  @Prop()
  title?: string; // Remedy name

  @Prop()
  description?: string; // Detailed description

  @Prop({
    enum: ['gemstone', 'mantra', 'puja', 'donation', 'yantra', 'other'],
  })
  type?: string; // Type of remedy

  @Prop()
  usageInstructions?: string; // How to use

  // ===== SHOPIFY PRODUCT REMEDY =====
  @Prop({
    type: {
      productId: Number,
      variantId: Number,
      productName: String,
      productHandle: String,
      productUrl: String,
      price: String,
      imageUrl: String,
      sku: String,
      description: String,
      type: String, // gemstone, mantra, etc.
    },
  })
  shopifyProduct?: {
    productId: number;
    variantId: number;
    productName: string;
    productHandle: string;
    productUrl: string;
    price: string;
    imageUrl: string;
    sku: string;
    description: string;
    type: string;
  };

  // ===== RECOMMENDATION DETAILS =====
  @Prop({ required: true })
  recommendationReason: string; // Why recommended

  @Prop({ enum: ['call', 'chat'] })
  suggestedInChannel?: string; // Through which consultation

  // ===== USER RESPONSE =====
  @Prop({
    required: true,
    enum: ['suggested', 'accepted', 'rejected'],
    default: 'suggested',
    index: true,
  })
  status: string; // User's response

  @Prop()
  userNotes?: string; // User's notes

  @Prop()
  acceptedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  // ===== PURCHASE TRACKING =====
  @Prop({ default: false, index: true })
  isPurchased: boolean; // Whether product was purchased

  @Prop({
    type: {
      shopifyOrderId: Number,
      orderNumber: String,
      lineItemId: Number,
      purchasedAt: Date,
      amount: Number,
      quantity: Number,
      variantId: Number,
    },
  })
  purchaseDetails?: {
    shopifyOrderId: number;
    orderNumber: string;
    lineItemId: number;
    purchasedAt: Date;
    amount: number;
    quantity: number;
    variantId: number;
  };

  // ===== METADATA =====
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;

  @Prop({ type: Date, default: () => new Date() })
  updatedAt: Date;
}

export const RemedySchema = SchemaFactory.createForClass(Remedy);

// === INDEXES ===
RemedySchema.index({ remedyId: 1 }, { unique: true });
RemedySchema.index({ userId: 1, createdAt: -1 });
RemedySchema.index({ astrologerId: 1, createdAt: -1 });
RemedySchema.index({ orderId: 1, isDeleted: 1 });
RemedySchema.index({ status: 1, isDeleted: 1 });
RemedySchema.index({ remedySource: 1, isDeleted: 1 });
RemedySchema.index({ isPurchased: 1, isDeleted: 1 });
RemedySchema.index({ userId: 1, orderId: 1, isDeleted: 1 });
RemedySchema.index({ astrologerId: 1, status: 1, createdAt: -1 });
