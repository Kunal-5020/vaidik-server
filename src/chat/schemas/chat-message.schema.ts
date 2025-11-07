// src/chat/schemas/chat-message.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ required: true, unique: true, index: true })
  messageId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ChatSession', index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  senderId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  senderModel: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: ['User', 'Astrologer'] })
  receiverModel: string;

  // ===== MESSAGE TYPE =====
  @Prop({ 
    required: true, 
    enum: ['text', 'image', 'audio', 'video', 'file', 'voice_note', 'kundli_details'] 
  })
  type: string;

  @Prop({ required: true, maxlength: 5000 })
  content: string;

  // ===== FILE HANDLING =====
  @Prop()
  fileUrl?: string;

  @Prop()
  fileS3Key?: string;

  @Prop()
  fileName?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  fileDuration?: number; // For audio/video/voice_note

  @Prop()
  mimeType?: string; // image/png, audio/mp3, etc

  // ===== KUNDLI DETAILS (Auto message) =====
  @Prop({
    type: {
      name: String,
      dob: String,
      birthTime: String,
      birthPlace: String,
      gender: String
    }
  })
  kundliDetails?: {
    name: string;
    dob: string;
    birthTime: string;
    birthPlace: string;
    gender: string;
  };

  // ===== REPLY =====
  @Prop()
  replyToId?: string;

  @Prop({
    type: {
      messageId: String,
      content: String,
      senderName: String,
      type: String
    }
  })
  replyTo?: {
    messageId: string;
    content: string;
    senderName: string;
    type: string;
  };

  // ===== REACTIONS =====
  @Prop({
    type: [{
      userId: Types.ObjectId,
      emoji: String,
      userModel: { enum: ['User', 'Astrologer'] },
      addedAt: Date
    }],
    default: []
  })
  reactions: Array<{
    userId: Types.ObjectId;
    emoji: string;
    userModel: string;
    addedAt: Date;
  }>;

  // ===== STAR/FAVORITE =====
  @Prop({ default: false })
  isStarred: boolean;

  @Prop({ type: [Types.ObjectId], default: [] })
  starredBy: Types.ObjectId[]; // Array of users who starred this

  @Prop()
  starredAt?: Date;

  // ===== EDITING =====
  @Prop({ default: false })
  isEdited: boolean;

  @Prop()
  editedAt?: Date;

  @Prop({
    type: [{
      content: String,
      editedAt: Date
    }],
    default: []
  })
  editHistory?: Array<{ content: string; editedAt: Date }>;

  // ===== DELETION =====
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ 
    enum: ['visible', 'deleted_for_sender', 'deleted_for_receiver', 'deleted_for_everyone'],
    default: 'visible'
  })
  deleteStatus: string;

  // ===== DELIVERY STATUS (Double/Blue Tick) =====
  @Prop({ 
    default: 'sending', 
    enum: ['sending', 'sent', 'delivered', 'read', 'failed'] 
  })
  deliveryStatus: string; // sending (grey), sent (grey), delivered (grey), read (blue)

  @Prop()
  sentAt: Date;

  @Prop()
  deliveredAt?: Date; // When receiver got it

  @Prop()
  readAt?: Date; // When receiver read it

  @Prop()
  failureReason?: string;

  // ===== VISIBILITY =====
  @Prop({ default: true })
  isVisibleToUser: boolean;

  @Prop({ default: true })
  isVisibleToAstrologer: boolean;

  // ===== METADATA =====
  @Prop({ default: Date.now, index: true })
  createdAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Indexes
ChatMessageSchema.index({ messageId: 1 }, { unique: true });
ChatMessageSchema.index({ sessionId: 1, sentAt: -1 });
ChatMessageSchema.index({ orderId: 1, sentAt: -1 });
ChatMessageSchema.index({ senderId: 1, sentAt: -1 });
ChatMessageSchema.index({ receiverId: 1, deliveryStatus: 1 });
ChatMessageSchema.index({ createdAt: -1 });
ChatMessageSchema.index({ isDeleted: 1, deleteStatus: 1 });
ChatMessageSchema.index({ isStarred: 1, sentAt: -1 });
ChatMessageSchema.index({ type: 1, sentAt: -1 });
