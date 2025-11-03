// notifications/schemas/notification.schema.ts (ENHANCED)
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, unique: true, index: true })
  notificationId: string;

  @Prop({ required: true, type: Types.ObjectId, refPath: 'recipientModel', index: true })
  recipientId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer', 'Admin'] })
  recipientModel: string;

  @Prop({ 
    required: true,
    enum: [
      'chat_message',
      'call_incoming',
      'call_missed',
      'call_ended',
      'order_created',
      'order_completed',
      'payment_success',
      'wallet_recharged',
      'remedy_suggested',
      'report_ready',
      'stream_started',          // Followed astrologer went live
      'stream_reminder',         // Livestream starting soon
      'stream_ended',
      'gift_received',           // Received gift in livestream
      'astrologer_approved',
      'astrologer_rejected',
      'payout_processed',
      'admin_alert',             // Critical admin alerts
      'system_announcement',     // Broadcast to all
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
  data?: Record<string, any>;

  @Prop()
  imageUrl?: string;

  @Prop()
  actionUrl?: string; // Deep link

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  // FCM tracking
  @Prop({ default: false })
  isPushSent: boolean;

  @Prop()
  pushSentAt?: Date;

  // Socket.io tracking
  @Prop({ default: false })
  isSocketSent: boolean;

  @Prop()
  socketSentAt?: Date;

  @Prop({ 
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  })
  priority: string;

  // Broadcast tracking
  @Prop({ default: false })
  isBroadcast: boolean;

  @Prop({ type: [Types.ObjectId] })
  broadcastRecipients?: Types.ObjectId[];

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
NotificationSchema.index({ isBroadcast: 1 });
  