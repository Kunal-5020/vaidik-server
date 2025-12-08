// src/payments/schemas/wallet-transaction.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ required: true, unique: true })
  transactionId: string;

  @Prop({ type: Types.ObjectId, refPath: 'userModel', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['User', 'Astrologer'], default: 'User' })
  userModel: string;

  @Prop({
    enum: [
      'recharge',
      'deduction',
      'charge',
      'refund',
      'bonus',
      'reward',
      'earning',
      'withdrawal',
      'hold',
      'giftcard',
      'gift',
      'session_payment', // ✅ NEW: For unified transactions
    ],
    required: true,
  })
  type: string;

  @Prop({ required: true })
  amount: number;

  @Prop()
  cashAmount?: number;

  @Prop()
  bonusAmount?: number;

  @Prop()
  isBonus?: boolean;

  // ✅ FIXED: Make optional
  @Prop()
  balanceBefore?: number;

  // ✅ FIXED: Make optional
  @Prop()
  balanceAfter?: number;

  @Prop()
  description?: string;

  @Prop()
  orderId?: string;

  // ✅ NEW: For tracking session payments
  @Prop()
  sessionId?: string;

  @Prop()
  sessionType?: string; // 'audio_call', 'video_call', 'chat'

  // ✅ NEW: Related user/astrologer
  @Prop({ type: Types.ObjectId, ref: 'User' })
  relatedUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Astrologer' })
  relatedAstrologerId?: Types.ObjectId;

  // ✅ NEW: Commission breakdown
  @Prop()
  grossAmount?: number; // Total charged to user

  @Prop()
  platformCommission?: number; // Platform's cut (40%)

  @Prop()
  netAmount?: number; // Astrologer's earning (60%)

  @Prop()
  paymentGateway?: string;

  @Prop()
  paymentId?: string;

  @Prop({ enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  linkedTransactionId?: string;

  @Prop()
  linkedHoldTransactionId?: string;

  @Prop()
  holdReleaseableAt?: Date;

  @Prop()
  convertedAt?: Date;

  @Prop()
  releasedAt?: Date;

  @Prop()
  giftCardCode?: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// Indexes
WalletTransactionSchema.index({ transactionId: 1 });
WalletTransactionSchema.index({ userId: 1, userModel: 1 });
WalletTransactionSchema.index({ type: 1, status: 1 });
WalletTransactionSchema.index({ orderId: 1 });
WalletTransactionSchema.index({ sessionId: 1 }); // ✅ NEW
WalletTransactionSchema.index({ relatedUserId: 1 }); // ✅ NEW
WalletTransactionSchema.index({ relatedAstrologerId: 1 }); // ✅ NEW
WalletTransactionSchema.index({ createdAt: -1 });
