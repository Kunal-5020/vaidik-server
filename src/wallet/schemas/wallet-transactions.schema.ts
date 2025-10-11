// wallet-transactions.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({
  timestamps: true,
  collection: 'wallet_transactions',
})
export class WalletTransaction {
  @Prop({ required: true, unique: true, index: true })
  transactionId: string; // "TXN_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: ['recharge', 'deduction', 'refund'],
    index: true
  })
  type: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, maxlength: 500 })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId; // Link to order if applicable

  @Prop({ required: true })
  balanceAfter: number;

  @Prop({ required: true })
  balanceBefore: number;

  @Prop({ 
    enum: ['success', 'pending', 'failed'],
    default: 'success',
    index: true
  })
  status: string;

  // Payment Gateway Info (for recharges)
  @Prop()
  paymentGateway?: string; // 'razorpay', 'phonepe', etc.

  @Prop()
  paymentId?: string; // External payment ID

  @Prop()
  paymentMethod?: string; // 'upi', 'card', 'netbanking'
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// === INDEXES ===
WalletTransactionSchema.index({ transactionId: 1 }, { unique: true });
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, type: 1 });
WalletTransactionSchema.index({ userId: 1, status: 1 });
WalletTransactionSchema.index({ createdAt: -1 });
WalletTransactionSchema.index({ orderId: 1 }); // For order-transaction lookup
