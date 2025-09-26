import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CallSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Astrologer', required: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  callId: string;

  @Prop({ required: true, enum: ['audio', 'video'] })
  callType: string;

  @Prop({ required: true })
  channelName: string;

  @Prop({ required: true })
  userUid: number;

  @Prop({ required: true })
  astrologerUid: number;

  @Prop({ default: 'initiated', enum: ['initiated', 'ringing', 'connected', 'ended', 'missed', 'declined'] })
  status: string;

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  duration: number; // in seconds

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  answeredAt?: Date;

  @Prop({ default: false })
  isRecorded: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop({
    type: {
      userJoined: { type: Boolean, default: false },
      astrologerJoined: { type: Boolean, default: false },
      userLeft: { type: Boolean, default: false },
      astrologerLeft: { type: Boolean, default: false }
    },
    default: () => ({
      userJoined: false,
      astrologerJoined: false,
      userLeft: false,
      astrologerLeft: false
    })
  })
  participants: {
    userJoined: boolean;
    astrologerJoined: boolean;
    userLeft: boolean;
    astrologerLeft: boolean;
  };

  @Prop({
    type: {
      callQuality: { type: String, enum: ['excellent', 'good', 'fair', 'poor'] },
      networkIssues: { type: Boolean, default: false },
      audioIssues: { type: Boolean, default: false },
      videoIssues: { type: Boolean, default: false }
    }
  })
  qualityMetrics?: {
    callQuality: string;
    networkIssues: boolean;
    audioIssues: boolean;
    videoIssues: boolean;
  };

  @Prop()
  endReason?: string; // 'completed', 'timeout', 'network_error', 'user_ended', 'astrologer_ended'
}

export type CallSessionDocument = CallSession & Document;
export const CallSessionSchema = SchemaFactory.createForClass(CallSession);

// Indexes for efficient queries
CallSessionSchema.index({ userId: 1, createdAt: -1 });
CallSessionSchema.index({ astrologerId: 1, createdAt: -1 });
CallSessionSchema.index({ callId: 1 });
CallSessionSchema.index({ status: 1 });
CallSessionSchema.index({ channelName: 1 });
