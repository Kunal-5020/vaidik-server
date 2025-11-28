import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  astrologerId: string; // registrationId of astrologer

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String, maxlength: 500 })
  comment?: string;

  @Prop({ 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'flagged'], 
    default: 'pending',
    index: true 
  })
  moderationStatus: string;

  @Prop({ type: String })
  moderationReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  moderatedBy?: Types.ObjectId;

  @Prop({ type: Date })
  moderatedAt?: Date;

  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  @Prop({ type: Date })
  editedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Compound indexes for performance
ReviewSchema.index({ astrologerId: 1, moderationStatus: 1 });
ReviewSchema.index({ userId: 1, orderId: 1 }, { unique: true }); // One review per order
ReviewSchema.index({ createdAt: -1 });
