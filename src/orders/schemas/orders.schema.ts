// src/orders/schemas/order.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({
  timestamps: true,
  collection: 'orders',
})
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  astrologerName: string;

  // ===== TYPE & CALL TYPE =====
  @Prop({ 
    required: true, 
    enum: ['chat', 'call'],
    index: true 
  })
  type: string;

  @Prop({ enum: ['audio', 'video'] })
  callType?: string;

  // ===== SESSION REFERENCES =====
  @Prop()
  chatSessionId?: string;

  @Prop()
  callSessionId?: string;

  // ===== STATUS FLOW =====
  @Prop({ 
    required: true,
    enum: [
      'pending',           // Initial state - waiting for astrologer response
      'waiting',           // Astrologer accepted - session about to start
      'waiting_in_queue',  // Astrologer busy - in queue
      'active',            // Session running - charging active
      'completed',         // Session ended normally
      'cancelled',         // Rejected/Timeout/User cancelled
      'refund_requested',  // User requested refund
      'refund_approved',   // Refund approved
      'refund_rejected',   // Refund rejected
      'refunded'          // Refund processed
    ],
    default: 'pending',
    index: true
  })
  status: string;

  // ===== TIMING =====
  @Prop()
  requestCreatedAt: Date; // When user initiated

  @Prop()
  acceptedAt?: Date; // When astrologer accepted

  @Prop()
  startedAt?: Date; // When session actually started (charging begins)

  @Prop()
  endedAt?: Date; // When session ended

  @Prop()
  expectedWaitTime?: number; // seconds - if in queue

  @Prop()
  estimatedStartTime?: Date; // When astrologer expected to be free

  @Prop()
  queuePosition?: number; // Position in waiting queue

  // ===== DURATION & PRICING =====
  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  maxDurationMinutes: number; // Full minutes only (7, not 7.5)

  @Prop({ default: 0 })
  actualDurationSeconds: number; // Real seconds used (280)

  @Prop({ default: 0 })
  billedMinutes: number; // Rounded up for billing (5)

  // ===== PAYMENT SYSTEM (Hold → Charge → Refund) =====
  @Prop({
    type: {
      status: { 
        type: String,
        enum: ['hold', 'charged', 'refunded', 'failed'],
        default: 'hold'
      },
      heldAmount: { type: Number, default: 0 },
      chargedAmount: { type: Number, default: 0 },
      refundedAmount: { type: Number, default: 0 },
      transactionId: String,
      holdTransactionId: String,
      chargeTransactionId: String,
      refundTransactionId: String,
      heldAt: Date,
      chargedAt: Date,
      refundedAt: Date,
      failureReason: String
    }
  })
  payment: {
    status: string;
    heldAmount: number;
    chargedAmount: number;
    refundedAmount: number;
    transactionId?: string;
    holdTransactionId?: string;
    chargeTransactionId?: string;
    refundTransactionId?: string;
    heldAt?: Date;
    chargedAt?: Date;
    refundedAt?: Date;
    failureReason?: string;
  };

  // ===== CANCELLATION =====
  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string; // 'rejected', 'timeout', 'user_cancelled', 'no_response'

  @Prop({ enum: ['user', 'astrologer', 'system', 'admin'] })
  cancelledBy?: string;

  // ===== RECORDING (for calls) =====
  @Prop({ default: false })
  hasRecording: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingS3Key?: string;

  @Prop()
  recordingDuration?: number;

  @Prop({ enum: ['voice_note', 'video', 'none'], default: 'none' })
  recordingType?: string;

  @Prop()
  recordingStartedAt?: Date;

  @Prop()
  recordingEndedAt?: Date;

  // ===== SESSION HISTORY (for continued consultations) =====
  @Prop({
    type: [{
      sessionId: String,
      sessionType: { type: String, enum: ['chat', 'audio_call', 'video_call'] },
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
    sessionType: string;
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
    billedMinutes: number;
    chargedAmount: number;
    recordingUrl?: string;
  }>;

  @Prop({ default: 0 })
  totalUsedDurationSeconds: number; // Cumulative

  @Prop({ default: 0 })
  totalBilledMinutes: number; // Cumulative

  @Prop({ default: 0 })
  totalAmount: number; // Total charged (all sessions combined)

  // ===== CONSULTATION STATE =====
  @Prop({ default: true })
  isActive: boolean; // Can user continue this consultation?

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

  // ===== REFUND REQUEST SYSTEM =====
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

  // ===== METADATA =====
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: Date.now, index: true })
  createdAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// ===== INDEXES =====
OrderSchema.index({ orderId: 1 }, { unique: true });
OrderSchema.index({ userId: 1, astrologerId: 1, isDeleted: 1, status: 1 });
OrderSchema.index({ userId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ astrologerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ orderId: 1, isDeleted: 1 });
OrderSchema.index({ isActive: 1, status: 1 });
OrderSchema.index({ 'payment.status': 1, createdAt: -1 });
OrderSchema.index({ 'refundRequest.status': 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ chatSessionId: 1 }, { sparse: true });
OrderSchema.index({ callSessionId: 1 }, { sparse: true });
