import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ required: true, unique: true, index: true })
  reportId: string; // "RPT_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  orderId: string; // Reference to Order

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['kundli', 'yearly_prediction', 'compatibility', 'numerology', 'palmistry', 'other'],
    index: true
  })
  type: string;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ type: String })
  content?: string; // Report content (text)

  @Prop()
  filePath?: string; // PDF URL (S3)

  @Prop()
  fileS3Key?: string; // S3 key for deletion

  @Prop()
  fileSize?: number; // File size in bytes

  @Prop({ 
    required: true,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending',
    index: true
  })
  status: string;

  @Prop()
  deliveredAt?: Date;

  @Prop({ default: 0 })
  downloadCount?: number; // Track how many times downloaded

  @Prop()
  lastDownloadedAt?: Date;

  @Prop()
  failureReason?: string; // If status is 'failed'

  @Prop()
  astrologerNotes?: string; // Internal notes from astrologer

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Indexes
ReportSchema.index({ reportId: 1 }, { unique: true });
ReportSchema.index({ userId: 1, createdAt: -1 });
ReportSchema.index({ astrologerId: 1, createdAt: -1 });
ReportSchema.index({ orderId: 1 });
ReportSchema.index({ status: 1 });
ReportSchema.index({ type: 1 });
ReportSchema.index({ userId: 1, status: 1 });
ReportSchema.index({ createdAt: -1 });
