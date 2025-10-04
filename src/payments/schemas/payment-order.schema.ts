// src/payments/schemas/payment-order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentOrderDocument = PaymentOrder & Document;

@Schema({ timestamps: true })
export class PaymentOrder {
  @Prop({ required: true, unique: true })
  orderId: string; // Razorpay order ID

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Astrologer' })
  astrologerId?: Types.ObjectId;

  @Prop({ required: true })
  amount: number; // Amount in paise (₹100 = 10000 paise)

  @Prop({ required: true, default: 'INR' })
  currency: string;

  @Prop({ required: true, enum: ['wallet_recharge', 'call_payment', 'chat_payment', 'stream_tip'] })
  purpose: string;

  @Prop({ required: true, enum: ['created', 'paid', 'failed', 'cancelled'], default: 'created' })
  status: string;

  @Prop() // Razorpay payment ID when captured
  paymentId?: string;

  @Prop() // Razorpay signature for verification
  signature?: string;

  @Prop() // Session/service reference
  serviceSessionId?: string;

  @Prop({ type: Object })
  razorpayResponse?: any; // Full Razorpay response

  @Prop({ type: Object })
  userDetails?: {
    name: string;
    email?: string;
    contact: string;
  };

  @Prop()
  failureReason?: string;

  @Prop()
  notes?: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  paidAt?: Date;

  @Prop() // Order expires in 15 minutes
  expiresAt: Date;
}

export const PaymentOrderSchema = SchemaFactory.createForClass(PaymentOrder);

// Indexes for performance
PaymentOrderSchema.index({ userId: 1, status: 1 });
PaymentOrderSchema.index({ orderId: 1 }, { unique: true });
PaymentOrderSchema.index({ paymentId: 1 });
PaymentOrderSchema.index({ createdAt: -1 });
