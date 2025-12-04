// src/transactions/schemas/transaction.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true, unique: true })
  transactionId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer' })
  astrologerId: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: ['credit', 'debit'],
    index: true 
  })
  type: 'credit' | 'debit';

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  description: string;

  @Prop({
    required: true,
    enum: [
      'call_earning',
      'chat_earning',
      'video_call_earning',
      'stream_earning',
      'payout',
      'refund',
      'penalty',
      'bonus',
      'adjustment',
      'commission',
    ],
  })
  category: string;

  @Prop({ 
    required: true, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'completed',
    index: true
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PayoutRequest' })
  payoutId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop()
  sessionId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  balanceBefore?: number;

  @Prop()
  balanceAfter?: number;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes
TransactionSchema.index({ astrologerId: 1, createdAt: -1 });
TransactionSchema.index({ transactionId: 1 });
TransactionSchema.index({ type: 1, status: 1 });
TransactionSchema.index({ category: 1 });
