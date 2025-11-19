import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GiftCardDocument = GiftCard & Document;

@Schema({ timestamps: true, collection: 'gift_cards' })
export class GiftCard {
  @Prop({ required: true, unique: true }) // ✅ unique creates index automatically
  code: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ default: 1 })
  maxRedemptions: number;

  @Prop({ default: 0 })
  redemptionsCount: number;

  @Prop({
    required: true,
    enum: ['active', 'disabled', 'expired', 'exhausted'],
    default: 'active',
    // ❌ REMOVED index: true (covered by compound index below)
  })
  status: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  redeemedBy?: Types.ObjectId;

  @Prop()
  redeemedAt?: Date;

  @Prop()
  redemptionTransactionId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const GiftCardSchema = SchemaFactory.createForClass(GiftCard);

// ✅ Keep only compound index
// ❌ REMOVED: GiftCardSchema.index({ code: 1 }); (duplicate of unique)
GiftCardSchema.index({ status: 1, expiresAt: 1 }); // Compound index
