import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ required: true, unique: true, index: true })
  messageId: string; // "MSG_20251002_ABC123"

  @Prop({ required: true, index: true })
  sessionId: string; // Reference to ChatSession

  @Prop({ required: true, type: Types.ObjectId, refPath: 'senderModel' })
  senderId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  senderModel: string; // For polymorphic reference

  @Prop({ required: true, type: Types.ObjectId, refPath: 'receiverModel' })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  receiverModel: string;

  @Prop({ 
    required: true,
    enum: ['text', 'image', 'audio', 'video', 'document'],
    default: 'text'
  })
  type: string;

  @Prop({ required: true, maxlength: 5000 })
  content: string; // Text content or file URL

  @Prop()
  fileUrl?: string; // For media messages

  @Prop()
  fileS3Key?: string; // S3 key for deletion

  @Prop()
  fileSize?: number;

  @Prop()
  fileName?: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ default: Date.now })
  sentAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Indexes
ChatMessageSchema.index({ messageId: 1 }, { unique: true });
ChatMessageSchema.index({ sessionId: 1, sentAt: 1 });
ChatMessageSchema.index({ senderId: 1, sentAt: -1 });
ChatMessageSchema.index({ receiverId: 1, isRead: 1 });
ChatMessageSchema.index({ createdAt: -1 });
