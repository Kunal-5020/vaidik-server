import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, unique: true, index: true })
  notificationId: string;

  @Prop({ required: true, type: Types.ObjectId, refPath: 'recipientModel', index: true })
  recipientId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  recipientModel: string;

  @Prop({ 
    required: true,
    enum: [
      'chat_message',
      'call_incoming',
      'call_missed',
      'order_completed',
      'payment_success',
      'wallet_recharged',
      'remedy_suggested',
      'report_ready',
      'stream_started',
      'astrologer_approved',
      'payout_processed',
      'general'
    ],
    index: true
  })
  type: string;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, maxlength: 1000 })
  message: string;

  @Prop({ type: Object })
  data?: Record<string, any>; // Deep link data, IDs, etc.

  @Prop()
  imageUrl?: string;

  @Prop()
  actionUrl?: string; // Deep link URL

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  @Prop({ default: false })
  isPushSent: boolean; // Track if push notification was sent

  @Prop()
  pushSentAt?: Date;

  @Prop({ 
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  })
  priority: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Indexes
NotificationSchema.index({ notificationId: 1 }, { unique: true });
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: -1 });
