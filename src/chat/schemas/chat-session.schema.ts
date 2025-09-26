import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Astrologer', required: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true, default: 'chat' })
  sessionType: string;

  @Prop({ default: 'active', enum: ['active', 'ended', 'abandoned'] })
  status: string;

  @Prop({ default: Date.now })
  startedAt: Date;

  @Prop()
  endedAt?: Date;
}

export type ChatSessionDocument = ChatSession & Document;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
