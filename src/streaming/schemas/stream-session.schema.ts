import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreamSessionDocument = StreamSession & Document;

@Schema({ timestamps: true, collection: 'stream_sessions' })
export class StreamSession {
  @Prop({ required: true, unique: true, index: true })
  streamId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  hostId: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ maxlength: 1000 })
  description?: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ 
    required: true,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled',
    index: true
  })
  status: string;

  @Prop({ 
    required: true,
    enum: ['free', 'paid'],
    default: 'free'
  })
  streamType: string;

  @Prop({ default: 0 })
  entryFee: number;

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  duration: number;

  // Agora Details
  @Prop()
  agoraChannelName?: string;

   @Prop({ required: true }) // ✅ Make sure this field exists
  hostAgoraUid: number;

  @Prop()
  agoraToken?: string;

  // Host Controls
  @Prop({ default: true })
  isMicEnabled: boolean;

  @Prop({ default: true })
  isCameraEnabled: boolean;

  @Prop({ 
    enum: ['streaming', 'on_call', 'idle'],
    default: 'streaming'
  })
  currentState: string;

  // ✅ NEW: Call Settings
  @Prop({
    type: {
      isCallEnabled: { type: Boolean, default: true },
      voiceCallPrice: { type: Number, default: 0 },
      videoCallPrice: { type: Number, default: 0 },
      allowPublicCalls: { type: Boolean, default: true },
      allowPrivateCalls: { type: Boolean, default: true },
      maxCallDuration: { type: Number, default: 600 }, // 10 minutes
    },
    default: () => ({
      isCallEnabled: true,
      voiceCallPrice: 0,
      videoCallPrice: 0,
      allowPublicCalls: true,
      allowPrivateCalls: true,
      maxCallDuration: 600,
    })
  })
  callSettings: {
    isCallEnabled: boolean;
    voiceCallPrice: number;
    videoCallPrice: number;
    allowPublicCalls: boolean;
    allowPrivateCalls: boolean;
    maxCallDuration: number;
  };

  // ✅ NEW: Current Call
  @Prop({
    type: {
      isOnCall: { type: Boolean, default: false },
      callerId: { type: Types.ObjectId, ref: 'User' },
      callerName: String,
      callType: { type: String, enum: ['voice', 'video'] },
      callMode: { type: String, enum: ['public', 'private'] },
      startedAt: Date,
      callerAgoraUid: Number,
      isCameraOn: Boolean,
    }
  })
  currentCall?: {
    isOnCall: boolean;
    callerId: Types.ObjectId;
    callerName: string;
    callType: 'voice' | 'video';
    callMode: 'public' | 'private';
    startedAt: Date;
    callerAgoraUid: number;
    isCameraOn: boolean;
  };

  // ✅ NEW: Call Waitlist
  @Prop({
    type: [{
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      userName: { type: String, required: true },
      userAvatar: String,
      callType: { type: String, enum: ['voice', 'video'], required: true },
      callMode: { type: String, enum: ['public', 'private'], required: true },
      requestedAt: { type: Date, default: Date.now },
      position: { type: Number, required: true },
      status: { type: String, enum: ['waiting', 'accepted', 'rejected', 'expired'], default: 'waiting' }
    }],
    default: []
  })
  callWaitlist: Array<{
    userId: Types.ObjectId;
    userName: string;
    userAvatar?: string;
    callType: 'voice' | 'video';
    callMode: 'public' | 'private';
    requestedAt: Date;
    position: number;
    status: string;
  }>;

  // Analytics
  @Prop({ default: 0 })
  viewerCount: number;

  @Prop({ default: 0 })
  peakViewers: number;

  @Prop({ default: 0 })
  totalViews: number;

  @Prop({ default: 0 })
  totalWatchTime: number;

  @Prop({ default: 0 })
  totalLikes: number;

  @Prop({ default: 0 })
  totalComments: number;

  @Prop({ default: 0 })
  totalGifts: number;

  @Prop({ default: 0 })
  totalRevenue: number;

  @Prop({ default: 0 })
  totalCalls: number;

  @Prop({ default: 0 })
  totalCallRevenue: number;

  // Stream Settings
  @Prop({ default: true })
  allowComments: boolean;

  @Prop({ default: true })
  allowGifts: boolean;

  @Prop({ default: false })
  isPrivate: boolean;

  // Recording
 @Prop({ type: Boolean, default: false })
  isRecording: boolean;

  @Prop({ type: String })
  recordingResourceId?: string;

  @Prop({ type: String })
  recordingSid?: string;

  @Prop({ type: String })
  recordingUrl?: string;

  @Prop({ type: [String] })
  recordingFiles?: string[];

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const StreamSessionSchema = SchemaFactory.createForClass(StreamSession);

// Indexes
StreamSessionSchema.index({ streamId: 1 }, { unique: true });
StreamSessionSchema.index({ hostId: 1, createdAt: -1 });
StreamSessionSchema.index({ status: 1, viewerCount: -1 });
StreamSessionSchema.index({ 'currentCall.isOnCall': 1 });
