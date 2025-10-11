import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RemedyDocument = Remedy & Document;

@Schema({ timestamps: true, collection: 'remedies' })
export class Remedy {
  @Prop({ required: true, unique: true, index: true })
  remedyId: string; // "REM_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  orderId: string; // Reference to Order

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  astrologerName: string;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, maxlength: 1000 })
  description: string;

  @Prop({ 
    required: true,
    enum: ['gemstone', 'mantra', 'puja', 'donation', 'yantra', 'other'],
    index: true
  })
  type: string;

  @Prop({ 
    required: true,
    enum: ['suggested', 'accepted', 'rejected'],
    default: 'suggested',
    index: true
  })
  status: string;

  @Prop()
  userNotes?: string; // User's notes after accepting/rejecting

  @Prop()
  acceptedAt?: Date;

  @Prop()
  rejectedAt?: Date;
}

export const RemedySchema = SchemaFactory.createForClass(Remedy);

// === INDEXES ===
RemedySchema.index({ remedyId: 1 }, { unique: true });
RemedySchema.index({ userId: 1, createdAt: -1 });
RemedySchema.index({ astrologerId: 1, createdAt: -1 });
RemedySchema.index({ orderId: 1 });
RemedySchema.index({ status: 1 });
RemedySchema.index({ type: 1 });
RemedySchema.index({ userId: 1, status: 1 });
