// src/calls/schemas/call-session.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallSessionDocument = CallSession & Document;

@Schema({ timestamps: true, collection: 'call_sessions' })
export class CallSession {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User'})
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer' })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  orderId: string;

  // ✅ NEW: Link to conversation thread
@Prop()
conversationThreadId?: string;

// ✅ NEW: Session sequence number
@Prop({ default: 1 })
sessionNumber: number;

// ✅ NEW: Message ID for the recording message in chat
@Prop()
recordingMessageId?: string;

  // ===== CALL TYPE =====
  @Prop({ required: true, enum: ['audio', 'video'] })
  callType: string;

  // ===== STATUS FLOW =====
  @Prop({
    required: true,
    enum: ['initiated', 'ringing', 'waiting', 'waiting_in_queue', 'active', 'ended', 'cancelled', 'rejected', 'failed'],
    default: 'initiated',
  })
  status: string;

  // ===== TIMING =====
  @Prop()
  requestCreatedAt: Date;

  @Prop({ default: false })
  userJoinedAgora: boolean;

  @Prop({ default: false })
  astrologerJoinedAgora: boolean;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  ringTime?: Date;

  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  @Prop({ default: 0 })
  maxDurationMinutes: number;

  @Prop({ default: 0 })
  maxDurationSeconds: number;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ default: 0 })
  billedMinutes: number;

  // ===== RATE & PRICING =====
  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  platformCommission: number;

  @Prop({ default: 0 })
  astrologerEarning: number;

  @Prop()
  postSessionWindowEndsAt?: Date;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop()
  paidAt?: Date;

  // ===== TIMER STATE =====
  @Prop({ 
    enum: ['not_started', 'running', 'paused', 'ended'],
    default: 'not_started'
  })
  timerStatus: string;

  @Prop({
    type: {
      elapsedSeconds: { type: Number, default: 0 },
      remainingSeconds: { type: Number, default: 0 },
      lastUpdatedAt: Date,
      warningShownAt1Min: { type: Boolean, default: false }
    }
  })
  timerMetrics: {
    elapsedSeconds: number;
    remainingSeconds: number;
    lastUpdatedAt?: Date;
    warningShownAt1Min?: boolean;
  };

  // ===== RECORDING =====
  @Prop({ default: false })
  hasRecording: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingS3Key?: string;

  @Prop()
  recordingDuration?: number;

  @Prop({ enum: ['voice_note', 'video'], default: 'voice_note' })
  recordingType?: string;

  @Prop()
  recordingStartedAt?: Date;

  @Prop()
  recordingEndedAt?: Date;

  // ===== PARTICIPANTS STATUS =====
  @Prop({
    type: {
      userId: { type: Types.ObjectId },
      isOnline: { type: Boolean, default: false },
      isMuted: { type: Boolean, default: false },
      isVideoOn: { type: Boolean, default: true },
      lastSeen: Date,
      connectionQuality: { type: String, enum: ['excellent', 'good', 'fair', 'poor', 'offline'], default: 'offline' }
    }
  })
  userStatus?: {
    userId: Types.ObjectId;
    isOnline: boolean;
    isMuted: boolean;
    isVideoOn: boolean;
    lastSeen?: Date;
    connectionQuality?: string;
  };

  @Prop({
    type: {
      astrologerId: { type: Types.ObjectId },
      isOnline: { type: Boolean, default: false },
      isMuted: { type: Boolean, default: false },
      isVideoOn: { type: Boolean, default: true },
      lastSeen: Date,
      connectionQuality: { type: String, enum: ['excellent', 'good', 'fair', 'poor', 'offline'], default: 'offline' }
    }
  })
  astrologerStatus?: {
    astrologerId: Types.ObjectId;
    isOnline: boolean;
    isMuted: boolean;
    isVideoOn: boolean;
    lastSeen?: Date;
    connectionQuality?: string;
  };

  // ===== QUEUE INFO =====
  @Prop()
  expectedWaitTime?: number; // seconds

  @Prop()
  estimatedStartTime?: Date;

  @Prop()
  queuePosition?: number;

  // ===== END DETAILS =====
  @Prop()
  endedBy?: string;

  @Prop()
  endReason?: string;

  // ===== CALL HISTORY (for continuation) =====
  @Prop({
    type: [{
      sessionId: String,
      startedAt: Date,
      endedAt: Date,
      durationSeconds: Number,
      billedMinutes: Number,
      chargedAmount: Number,
      recordingUrl: String
    }],
    default: []
  })
  sessionHistory: Array<{
    sessionId: string;
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
    billedMinutes: number;
    chargedAmount: number;
    recordingUrl?: string;
  }>;

  @Prop({ default: 0 })
  totalUsedDurationSeconds: number;

  @Prop({ default: 0 })
  totalBilledMinutes: number;

  // ===== CONSULTATION STATE =====
  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastSessionEndTime?: Date;

  // ===== REVIEW & RATING =====
  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ maxlength: 500 })
  review?: string;

  @Prop({ default: false })
  reviewSubmitted: boolean;

  @Prop()
  reviewSubmittedAt?: Date;

  // ===== REFUND REQUEST =====
  @Prop({
    type: {
      requestedAt: Date,
      requestedBy: { type: Types.ObjectId, ref: 'User' },
      reason: String,
      status: { 
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      },
      processedAt: Date,
      processedBy: { type: Types.ObjectId, ref: 'User' },
      adminNotes: String,
      rejectionReason: String,
      refundAmount: Number,
      refundPercentage: { type: Number, default: 100 }
    }
  })
  refundRequest?: {
    requestedAt: Date;
    requestedBy: Types.ObjectId;
    reason: string;
    status: string;
    processedAt?: Date;
    processedBy?: Types.ObjectId;
    adminNotes?: string;
    rejectionReason?: string;
    refundAmount?: number;
    refundPercentage?: number;
  };

  // ===== BILLING =====
@Prop({ default: 0 })
billedDuration: number; // In seconds (round up to nearest minute, then convert)

// Add to existing billing section:
@Prop({ default: 0 })
estimatedAmount: number;

// Add AGORA fields
@Prop()
agoraChannelName?: string;

@Prop()
agoraUserToken?: string; // Token for user

@Prop()
agoraAstrologerToken?: string; // Token for astrologer

@Prop({ type: Number })
agoraUserUid?: number; // UID for user

@Prop({ type: Number })
agoraAstrologerUid?: number; // UID for astrologer

@Prop()
recordingStarted: Date; // Agora recording start time

  // ===== METADATA =====
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const CallSessionSchema = SchemaFactory.createForClass(CallSession);

// Indexes
// Unique index for sessionId is created via @Prop({ unique: true })
CallSessionSchema.index({ userId: 1, createdAt: -1 });
CallSessionSchema.index({ astrologerId: 1, createdAt: -1 });
CallSessionSchema.index({ orderId: 1 });
CallSessionSchema.index({ userId: 1, status: 1 });
CallSessionSchema.index({ astrologerId: 1, status: 1 });
