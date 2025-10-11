import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true, collection: 'wallet_transactions' })
export class WalletTransaction {
  @Prop({ required: true, unique: true, index: true })
  transactionId: string; // "TXN_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['recharge', 'deduction', 'refund', 'bonus'],
    index: true
  })
  type: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  balanceBefore: number;

  @Prop({ required: true })
  balanceAfter: number;

  @Prop({ required: true, maxlength: 500 })
  description: string;

  @Prop()
  orderId?: string; // Reference to Order (if applicable)

  @Prop()
  paymentGateway?: string; // 'razorpay', 'phonepe', 'paytm', etc.

  @Prop()
  paymentId?: string; // Payment gateway transaction ID

  @Prop({ 
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  })
  status: string;

  @Prop()
  failureReason?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// Indexes
WalletTransactionSchema.index({ transactionId: 1 }, { unique: true });
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, type: 1 });
WalletTransactionSchema.index({ userId: 1, status: 1 });
WalletTransactionSchema.index({ paymentId: 1 }, { sparse: true });
WalletTransactionSchema.index({ orderId: 1 }, { sparse: true });
WalletTransactionSchema.index({ createdAt: -1 });
