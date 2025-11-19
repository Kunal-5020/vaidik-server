// notifications/schemas/scheduled-notification.schema.ts (NEW)
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScheduledNotificationDocument = ScheduledNotification & Document;

@Schema({ timestamps: true, collection: 'scheduled_notifications' })
export class ScheduledNotification {
  @Prop({ required: true, unique: true })
  scheduleId: string;

  @Prop({ required: true, index: true })
  scheduledFor: Date;

  @Prop({ required: true, enum: ['pending', 'sent', 'failed', 'cancelled'], index: true })
  status: string;

  // Notification details
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object })
  data?: Record<string, any>;

  @Prop()
  imageUrl?: string;

  @Prop()
  actionUrl?: string;

  @Prop({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: string;

  // Recipients
  @Prop({ required: true, enum: ['all_users', 'all_astrologers', 'specific_users', 'followers'] })
  recipientType: string;

  @Prop({ type: [Types.ObjectId] })
  specificRecipients?: Types.ObjectId[];

  @Prop({ type: Types.ObjectId })
  astrologerId?: Types.ObjectId; // For follower notifications

  // Tracking
  @Prop()
  sentAt?: Date;

  @Prop()
  failureReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy: Types.ObjectId; // Admin who scheduled it

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ScheduledNotificationSchema = SchemaFactory.createForClass(ScheduledNotification);

// Indexes
// Unique index for scheduleId is created via @Prop({ unique: true })
ScheduledNotificationSchema.index({ scheduledFor: 1, status: 1 });
ScheduledNotificationSchema.index({ createdBy: 1 });
