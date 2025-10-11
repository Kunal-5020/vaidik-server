import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LiveStreamDocument = LiveStream & Document;

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
  duration: number;

  // Viewer Stats
  @Prop({ default: 0 })
  maxViewers: number;

  @Prop({ default: 0 })
  totalViewers: number;

  @Prop({ default: 0 })
  currentViewers: number;

  // Engagement Stats (aggregated from separate collections)
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
}

export const LiveStreamSchema = SchemaFactory.createForClass(LiveStream);

// ✅ CRITICAL INDEXES
LiveStreamSchema.index({ astrologerId: 1, status: 1 });
LiveStreamSchema.index({ status: 1, scheduledAt: 1 });
LiveStreamSchema.index({ streamId: 1 }, { unique: true });
LiveStreamSchema.index({ category: 1, status: 1 });
LiveStreamSchema.index({ createdAt: -1 });
LiveStreamSchema.index({ status: 1, currentViewers: -1 }); // For trending

// Virtuals for tips and messages (query from separate collections)
LiveStreamSchema.virtual('tips', {
  ref: 'StreamTip',
  localField: '_id',
  foreignField: 'streamId'
});

LiveStreamSchema.virtual('chatMessages', {
  ref: 'StreamMessage',
  localField: '_id',
  foreignField: 'streamId'
});
