import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class LiveStream {
  @Prop({ type: Types.ObjectId, ref: 'Astrologer', required: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  streamId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ required: true })
  channelName: string;

  @Prop({ default: 'scheduled', enum: ['scheduled', 'live', 'ended', 'cancelled'] })
  status: string;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  duration: number; // in seconds

  @Prop({ default: 0 })
  maxViewers: number;

  @Prop({ default: 0 })
  totalViewers: number;

  @Prop({ default: 0 })
  currentViewers: number;

  @Prop({ default: 0 })
  totalTips: number;

  @Prop({ default: 0 })
  totalMessages: number;

  @Prop({ default: false })
  isRecorded: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 'general', enum: ['general', 'astrology', 'tarot', 'numerology', 'palmistry'] })
  category: string;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop({ default: 0 })
  entryFee: number;

  @Prop({
    type: {
      allowChat: { type: Boolean, default: true },
      allowTips: { type: Boolean, default: true },
      allowQuestions: { type: Boolean, default: true },
      moderationEnabled: { type: Boolean, default: false }
    },
    default: () => ({
      allowChat: true,
      allowTips: true,
      allowQuestions: true,
      moderationEnabled: false
    })
  })
  settings: {
    allowChat: boolean;
    allowTips: boolean;
    allowQuestions: boolean;
    moderationEnabled: boolean;
  };

  @Prop({
    type: [{
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      amount: { type: Number, required: true },
      message: { type: String },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  tips: {
    userId: Types.ObjectId;
    amount: number;
    message?: string;
    createdAt: Date;
  }[];

  @Prop({
    type: [{
      messageId: { type: String, required: true },
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      userName: { type: String, required: true },
      message: { type: String, required: true },
      messageType: { type: String, enum: ['text', 'question', 'tip'], default: 'text' },
      isModerated: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  chatMessages: {
    messageId: string;
    userId: Types.ObjectId;
    userName: string;
    message: string;
    messageType: string;
    isModerated: boolean;
    createdAt: Date;
  }[];
}

export type LiveStreamDocument = LiveStream & Document;
export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);

// Indexes for live streaming
LiveStreamSchema.index({ astrologerId: 1, status: 1 });
LiveStreamSchema.index({ status: 1, scheduledAt: 1 });
LiveStreamSchema.index({ streamId: 1 });
LiveStreamSchema.index({ category: 1, status: 1 });
LiveStreamSchema.index({ createdAt: -1 });
