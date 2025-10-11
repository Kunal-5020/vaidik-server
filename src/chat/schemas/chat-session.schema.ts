import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

@Schema({ timestamps: true, collection: 'chat_sessions' })
export class ChatSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string; // "CHAT_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  orderId: string; // Reference to Order

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
  duration: number; // in seconds

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  endedBy?: string; // 'user' | 'astrologer' | 'system'

  @Prop()
  endReason?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Indexes
ChatSessionSchema.index({ sessionId: 1 }, { unique: true });
ChatSessionSchema.index({ userId: 1, createdAt: -1 });
ChatSessionSchema.index({ astrologerId: 1, createdAt: -1 });
ChatSessionSchema.index({ orderId: 1 });
ChatSessionSchema.index({ status: 1 });
ChatSessionSchema.index({ createdAt: -1 });
