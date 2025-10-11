import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallSessionDocument = CallSession & Document;

@Schema({ timestamps: true, collection: 'call_sessions' })
export class CallSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true, enum: ['audio', 'video'], default: 'audio' })
  callType: string;

  @Prop({ 
    required: true,
    enum: ['initiated', 'ringing', 'active', 'ended', 'cancelled', 'missed', 'rejected'],
    default: 'initiated',
    index: true
  })
  status: string;

  // Agora Details
  @Prop()
  agoraChannelName?: string;

  @Prop()
  agoraToken?: string;

  @Prop()
  agoraUid?: number;

  @Prop()
  agoraResourceId?: string; // For recording

  @Prop()
  agoraSid?: string; // Recording session ID

  // Timing Details
  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  @Prop()
  ringTime?: Date;

  @Prop()
  answerTime?: Date;

  @Prop({ default: 0 })
  duration: number; // Total talk time in seconds

  @Prop({ default: 0 })
  billedDuration: number; // Rounded duration for billing (seconds)

  // Billing Details
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

  // ✅ Call Quality & Metrics
  @Prop({
    type: {
      averageQuality: { type: Number, default: 0 }, // 0-5
      userNetworkQuality: { type: Number, default: 0 }, // 0-5
      astrologerNetworkQuality: { type: Number, default: 0 }, // 0-5
      reconnectionCount: { type: Number, default: 0 },
      totalFreezeDuration: { type: Number, default: 0 }, // seconds
      videoDisabledDuration: { type: Number, default: 0 }, // seconds (if video call)
      audioDisabledDuration: { type: Number, default: 0 } // seconds
    },
    default: () => ({
      averageQuality: 0,
      userNetworkQuality: 0,
      astrologerNetworkQuality: 0,
      reconnectionCount: 0,
      totalFreezeDuration: 0,
      videoDisabledDuration: 0,
      audioDisabledDuration: 0
    })
  })
  callMetrics: {
    averageQuality: number;
    userNetworkQuality: number;
    astrologerNetworkQuality: number;
    reconnectionCount: number;
    totalFreezeDuration: number;
    videoDisabledDuration: number;
    audioDisabledDuration: number;
  };

  // Recording Details
  @Prop({ default: false })
  isRecorded: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingS3Key?: string;

  @Prop()
  recordingDuration?: number;

  @Prop()
  recordingStartedAt?: Date;

  @Prop()
  recordingStoppedAt?: Date;

  // End Details
  @Prop()
  endedBy?: string;

  @Prop()
  endReason?: string;

  @Prop()
  userRating?: number; // 1-5

  @Prop()
  userFeedback?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const CallSessionSchema = SchemaFactory.createForClass(CallSession);

// Indexes
CallSessionSchema.index({ sessionId: 1 }, { unique: true });
CallSessionSchema.index({ userId: 1, createdAt: -1 });
CallSessionSchema.index({ astrologerId: 1, createdAt: -1 });
CallSessionSchema.index({ orderId: 1 });
CallSessionSchema.index({ status: 1 });
CallSessionSchema.index({ agoraChannelName: 1 }, { sparse: true });
CallSessionSchema.index({ isPaid: 1, status: 1 });
CallSessionSchema.index({ createdAt: -1 });
