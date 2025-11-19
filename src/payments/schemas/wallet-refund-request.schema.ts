import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletRefundRequestDocument = WalletRefundRequest & Document;

@Schema({ timestamps: true, collection: 'wallet_refund_requests' })
export class WalletRefundRequest {
  @Prop({ required: true, unique: true, index: true })
  refundId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  amountRequested: number;

  @Prop()
  amountApproved?: number;

  @Prop({ required: true })
  cashBalanceSnapshot: number;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected', 'processed'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop()
  reason?: string;

  @Prop()
  adminNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  processedBy?: Types.ObjectId;

  @Prop()
  processedAt?: Date;

  @Prop()
  paymentReference?: string; // Razorpay refund / payout reference
}

export const WalletRefundRequestSchema = SchemaFactory.createForClass(WalletRefundRequest);

WalletRefundRequestSchema.index({ userId: 1, createdAt: -1 });
WalletRefundRequestSchema.index({ status: 1, createdAt: -1 });
