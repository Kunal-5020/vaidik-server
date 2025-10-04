// src/payments/schemas/wallet-transaction.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ required: true, unique: true })
  transactionId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Astrologer' })
  astrologerId?: Types.ObjectId;

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: 'credit' | 'debit';

  @Prop({ required: true })
  amount: number; // Amount in rupees

  @Prop({ required: true })
  balanceAfter: number; // Wallet balance after transaction

  @Prop({ required: true, enum: [
    'wallet_recharge', 'call_payment', 'chat_payment', 'stream_tip', 
    'refund', 'commission', 'bonus', 'withdrawal'
  ] })
  purpose: string;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'completed' })
  status: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'PaymentOrder' })
  paymentOrderId?: Types.ObjectId;

  @Prop() // Reference to call/chat session
  sessionId?: string;

  @Prop({ type: Object })
  metadata?: any;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// Indexes
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ astrologerId: 1, createdAt: -1 });
WalletTransactionSchema.index({ transactionId: 1 }, { unique: true });
WalletTransactionSchema.index({ purpose: 1, status: 1 });
