// src/chat/schemas/chat-session.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ✅ ADD: Export the document type
export type ChatSessionDocument = ChatSession & Document;

@Schema({ timestamps: true, collection: 'chat_sessions' })
export class ChatSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  orderId: string;

  @Prop({ 
    required: true,
    enum: ['waiting', 'active', 'ended', 'cancelled'],
    default: 'waiting',
    index: true
  })
  status: string;

  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ default: 0 })
  billedDuration: number;

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  platformCommission: number;

  @Prop({ default: 0 })
  astrologerEarning: number;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop()
  paidAt?: Date;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastMessageAt?: Date;

  @Prop({
    type: {
      content: String,
      type: String,
      sentBy: String,
      sentAt: Date
    }
  })
  lastMessage?: {
    content: string;
    type: string;
    sentBy: string;
    sentAt: Date;
  };

  @Prop({
    type: {
      userId: { type: Types.ObjectId },
      isOnline: { type: Boolean, default: false },
      lastSeen: Date
    }
  })
  userStatus?: {
    userId: Types.ObjectId;
    isOnline: boolean;
    lastSeen?: Date;
  };

  @Prop({
    type: {
      astrologerId: { type: Types.ObjectId },
      isOnline: { type: Boolean, default: false },
      lastSeen: Date
    }
  })
  astrologerStatus?: {
    astrologerId: Types.ObjectId;
    isOnline: boolean;
    lastSeen?: Date;
  };

  @Prop()
  endedBy?: string;

  @Prop()
  endReason?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

// ✅ CRITICAL: Export the schema
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Indexes
ChatSessionSchema.index({ sessionId: 1 }, { unique: true });
ChatSessionSchema.index({ userId: 1, createdAt: -1 });
ChatSessionSchema.index({ astrologerId: 1, createdAt: -1 });
ChatSessionSchema.index({ orderId: 1 });
ChatSessionSchema.index({ status: 1 });
ChatSessionSchema.index({ createdAt: -1 });
