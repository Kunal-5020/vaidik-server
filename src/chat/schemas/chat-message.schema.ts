// src/chat/schemas/chat-message.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ required: true, unique: true, index: true })
  messageId: string;

  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, type: Types.ObjectId, refPath: 'senderModel' })
  senderId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  senderModel: string;

  @Prop({ required: true, type: Types.ObjectId, refPath: 'receiverModel' })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  receiverModel: string;

  @Prop({ 
    required: true,
    enum: ['text', 'image', 'audio', 'video', 'document', 'voice_note'],
    default: 'text'
  })
  type: string;

  @Prop({ required: true, maxlength: 5000 })
  content: string;

  @Prop()
  fileUrl?: string;

  @Prop()
  fileS3Key?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  fileName?: string;

  @Prop()
  thumbnailUrl?: string; // ✅ ADD

  @Prop()
  duration?: number; // ✅ ADD

  @Prop({ 
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  })
  deliveryStatus: string; // ✅ ADD

  @Prop({ default: Date.now })
  sentAt: Date;

  @Prop()
  deliveredAt?: Date; // ✅ ADD

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'ChatMessage' })
  replyTo?: Types.ObjectId; // ✅ ADD

  @Prop({
    type: {
      messageId: String,
      content: String,
      type: String,
      senderName: String
    }
  })
  quotedMessage?: { // ✅ ADD
    messageId: string;
    content: string;
    type: string;
    senderName: string;
  };

  @Prop({
    type: [{
      userId: { type: Types.ObjectId, refPath: 'userModel' },
      userModel: { type: String, enum: ['User', 'Astrologer'] },
      emoji: String,
      reactedAt: Date
    }],
    default: []
  })
  reactions: Array<{ // ✅ ADD
    userId: Types.ObjectId;
    userModel: string;
    emoji: string;
    reactedAt: Date;
  }>;

  @Prop({ type: [{ type: Types.ObjectId }], default: [] })
  starredBy: Types.ObjectId[]; // ✅ ADD

  @Prop({ default: false })
  isForwarded: boolean; // ✅ ADD

  @Prop()
  originalMessageId?: string; // ✅ ADD

  @Prop({ default: false })
  isEdited: boolean; // ✅ ADD

  @Prop()
  editedAt?: Date; // ✅ ADD

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ enum: ['sender', 'everyone'], default: 'sender' })
  deletedFor?: string; // ✅ ADD
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Indexes
ChatMessageSchema.index({ messageId: 1 }, { unique: true });
ChatMessageSchema.index({ sessionId: 1, sentAt: 1 });
ChatMessageSchema.index({ senderId: 1, sentAt: -1 });
ChatMessageSchema.index({ receiverId: 1, isRead: 1 });
ChatMessageSchema.index({ receiverId: 1, deliveryStatus: 1 });
ChatMessageSchema.index({ replyTo: 1 }, { sparse: true });
ChatMessageSchema.index({ createdAt: -1 });
