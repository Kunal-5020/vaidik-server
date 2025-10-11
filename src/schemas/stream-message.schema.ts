import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreamMessageDocument = StreamMessage & Document;

@Schema({ timestamps: true })
export class StreamMessage {
  @Prop({ required: true, unique: true })
  messageId: string;

  @Prop({ type: Types.ObjectId, ref: 'LiveStream', required: true })
  streamId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'text', enum: ['text', 'question', 'tip'] })
  messageType: string;

  @Prop({ default: false })
  isModerated: boolean;

  @Prop()
  moderatedBy?: Types.ObjectId;

  @Prop()
  moderationReason?: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;
}

export const StreamMessageSchema = SchemaFactory.createForClass(StreamMessage);

// ✅ CRITICAL INDEXES
StreamMessageSchema.index({ streamId: 1, createdAt: 1 });
StreamMessageSchema.index({ messageId: 1 }, { unique: true });
StreamMessageSchema.index({ userId: 1, streamId: 1 });
StreamMessageSchema.index({ createdAt: -1 });
StreamMessageSchema.index({ isModerated: 1 });
