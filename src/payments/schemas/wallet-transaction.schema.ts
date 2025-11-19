import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true, collection: 'wallet_transactions' })
export class WalletTransaction {
  @Prop({ required: true, unique: true }) // ✅ Add unique here
  transactionId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) // ❌ REMOVED index: true
  userId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  balanceBefore: number;

  @Prop({ required: true })
  balanceAfter: number;

  @Prop({ required: true, maxlength: 500 })
  description: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop()
  orderId?: string;

  @Prop()
  paymentGateway?: string;

  @Prop()
  paymentId?: string;

  @Prop()
  promotionId?: string;

  @Prop({ default: 0 })
  bonusAmount?: number;

  @Prop({ 
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    // ❌ REMOVED index: true (covered by compound index below)
  })
  status: string;

  @Prop()
  failureReason?: string;

  @Prop({ enum: ['recharge', 'deduction', 'refund', 'hold', 'charge', 'bonus', 'reward'] })
  type: string;

  @Prop()
  holdReleaseableAt?: Date;

  @Prop()
  releasedAt?: Date;

  @Prop()
  convertedAt?: Date;

  @Prop()
  linkedTransactionId?: string;

  @Prop()
  linkedHoldTransactionId?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// ===== INDEXES =====
// ❌ REMOVED: WalletTransactionSchema.index({ transactionId: 1 }, { unique: true });
// (Already covered by @Prop unique: true above)

WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, type: 1 });
WalletTransactionSchema.index({ userId: 1, status: 1 });
WalletTransactionSchema.index({ paymentId: 1 }, { sparse: true });
WalletTransactionSchema.index({ orderId: 1 }, { sparse: true });
WalletTransactionSchema.index({ createdAt: -1 });
