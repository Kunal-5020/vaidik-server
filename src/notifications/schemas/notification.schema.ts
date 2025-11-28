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
      // ✅ EXISTING TYPES (KEEP)
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
      'stream_started',
      'stream_reminder',
      'stream_ended',
      'gift_received',
      'astrologer_approved',
      'astrologer_rejected',
      'payout_processed',
      'admin_alert',
      'system_announcement',
      'general',

      // ✅ REFINED / NEW TYPES ALREADY USED IN SERVICE
      'call_video',
      'call_audio',
      'message_direct',
      'chat_group',
      'live_event_started',
      'live_event_reminder',
      'system_promotional',
      'force_logout',

      // ✅ NEW APP-LEVEL TYPES (ADD THESE)
      // Chat / call request lifecycle
      'chat_request',
      'call_request_audio',
      'call_request_video',
      'request_accepted',
      'request_rejected',
      'request_expired',

      // Queue / waiting
      'added_to_queue',
      'queue_update',
      'queue_position_update',
      'your_turn',

      // Session lifecycle
      'session_starting',
      'session_ending',
      'session_ending_soon',
      'session_ended',

      // Balance / payments
      'low_balance',
      'low_balance_warning',
      'payment_failed',
      'earnings_credited',

      // Misc
      'gift_sent',
      'promotional',
    ],
    index: true,
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

  @Prop({ default: false })
isFullScreen?: boolean;

@Prop()
soundFileName?: string;

@Prop({ type: Object })
notificationConfig?: {
  showInForeground?: boolean;
  showInBackground?: boolean;
  vibrate?: boolean;
  badge?: number;
  channelId?: string;
  category?: string;
};

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
// Unique index for notificationId is created via @Prop({ unique: true })
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ isBroadcast: 1 });
  