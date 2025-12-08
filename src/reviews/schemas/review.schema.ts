// src/reviews/schemas/review.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ required: true, unique: true, index: true })
  reviewId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  orderId: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ maxlength: 500, default: '' })
  reviewText: string;

  @Prop({ 
    required: true,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending',
    index: true
  })
  moderationStatus: string;

  @Prop()
  moderationReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  moderatedBy?: Types.ObjectId;

  @Prop()
  moderatedAt?: Date;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop()
  editedAt?: Date;

  @Prop({ 
    required: true,
    enum: ['chat', 'call', 'video_call'],
  })
  serviceType: string;

  @Prop()
  sessionDuration?: number;

  @Prop({ default: false })
  isTestData: boolean;

  // ✅ Test user data fields
  @Prop()
  testUserName?: string;

  @Prop()
  testUserImage?: string;

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Compound Indexes
ReviewSchema.index({ astrologerId: 1, moderationStatus: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, astrologerId: 1 });
ReviewSchema.index({ orderId: 1 }, { unique: true });
ReviewSchema.index({ moderationStatus: 1, createdAt: -1 });
ReviewSchema.index({ rating: 1, moderationStatus: 1 });
