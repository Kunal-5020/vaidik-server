import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PayoutRequestDocument = PayoutRequest & Document;

@Schema({ timestamps: true, collection: 'payout_requests' })
export class PayoutRequest {
  @Prop({ required: true, unique: true, index: true })
  payoutId: string; // "PAYOUT_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ 
    required: true,
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
    default: 'pending',
    index: true
  })
  status: string;

  @Prop({
    type: {
      accountHolderName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
      bankName: String,
      upiId: String
    },
    required: true
  })
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName?: string;
    upiId?: string;
  };

  @Prop()
  transactionReference?: string; // Bank transaction reference

  @Prop()
  approvedBy?: Types.ObjectId; // Admin who approved

  @Prop()
  approvedAt?: Date;

  @Prop()
  processedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop()
  adminNotes?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const PayoutRequestSchema = SchemaFactory.createForClass(PayoutRequest);

// Indexes
PayoutRequestSchema.index({ payoutId: 1 }, { unique: true });
PayoutRequestSchema.index({ astrologerId: 1, createdAt: -1 });
PayoutRequestSchema.index({ status: 1, createdAt: -1 });
PayoutRequestSchema.index({ createdAt: -1 });
