import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({
  timestamps: true,
  collection: 'orders',
})
export class Order {
  @Prop({ required: true, unique: true }) // ✅ unique creates index automatically
  orderId: string;

  @Prop()
  conversationThreadId?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) // ❌ REMOVED index: true
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer' }) // ❌ REMOVED index: true
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  astrologerName: string;

  @Prop({ 
    required: true, 
    enum: ['chat', 'call', 'conversation'], // ❌ REMOVED index: true
  })
  type: string;

  @Prop({
    type: {
      content: String,
      type: String, // text, image, audio, etc.
      sentBy: String,
      sentAt: Date,
      isRead: Boolean
    }
  })
  lastMessage?: {
    content: string;
    type: string;
    sentBy: string;
    sentAt: Date;
    isRead: boolean;
  };

  @Prop({ enum: ['audio', 'video'] })
  callType?: string;

  @Prop()
  chatSessionId?: string;

  @Prop()
  callSessionId?: string;

  @Prop()
  currentSessionId?: string;

  @Prop({ enum: ['chat', 'audio_call', 'video_call', 'none'], default: 'none' })
  currentSessionType?: string;

  @Prop({ 
    required: true,
    enum: [
      'pending',           
      'waiting',           
      'waiting_in_queue',  
      'active',
      'completed',         
      'cancelled',         
      'refund_requested',  
      'refund_approved',   
      'refund_rejected',   
      'refunded'
    ],
    default: 'pending',
    // ❌ REMOVED index: true (covered by compound indexes below)
  })
  status: string;

  @Prop()
  requestCreatedAt: Date;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  expectedWaitTime?: number;

  @Prop()
  estimatedStartTime?: Date;

  @Prop()
  queuePosition?: number;

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ default: 0 })
  maxDurationMinutes: number;

  @Prop({ default: 0 })
  actualDurationSeconds: number;

  @Prop({ default: 0 })
  billedMinutes: number;

  @Prop({
    type: {
      status: { 
        type: String,
        enum: ['hold', 'charged', 'refunded', 'failed', 'none'],
        default: 'none'
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

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  @Prop({ enum: ['user', 'astrologer', 'system', 'admin'] })
  cancelledBy?: string;

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

  @Prop({
    type: [{
      sessionId: String,
      sessionType: { type: String, enum: ['chat', 'audio_call', 'video_call'] },
      startedAt: Date,
      endedAt: Date,
      durationSeconds: Number,
      billedMinutes: Number,
      chargedAmount: Number,
      recordingUrl: String,
      recordingType: String,
      status: { type: String, enum: ['completed', 'cancelled', 'failed'], default: 'completed' }
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
    recordingType?: string;
    status?: string;
  }>;

  @Prop({ default: 0 })
  totalUsedDurationSeconds: number;

  @Prop({ default: 0 })
  totalBilledMinutes: number;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  totalSessions: number;

  @Prop({ default: 0 })
  totalChatSessions: number;

  @Prop({ default: 0 })
  totalCallSessions: number;

  @Prop()
  lastInteractionAt?: Date;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastSessionEndTime?: Date;

  @Prop({ default: false })
reviewGiven: boolean; // Just track if review was submitted

@Prop()
reviewGivenAt?: Date;

@Prop({ type: Types.ObjectId, ref: 'Review' })
reviewId?: Types.ObjectId; 

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

  @Prop({ default: false }) // ❌ REMOVED index: true
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ default: Date.now }) // ❌ REMOVED index: true
  createdAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// ===== INDEXES (Compound indexes only) =====
OrderSchema.index({ conversationThreadId: 1 }, { sparse: true });
OrderSchema.index({ userId: 1, astrologerId: 1 });
OrderSchema.index({ userId: 1, astrologerId: 1, type: 1 });
OrderSchema.index({ userId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ astrologerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ orderId: 1, isDeleted: 1 }); // Compound index is OK
OrderSchema.index({ isActive: 1, status: 1 });
OrderSchema.index({ 'payment.status': 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ chatSessionId: 1 }, { sparse: true });
OrderSchema.index({ callSessionId: 1 }, { sparse: true });
OrderSchema.index({ lastInteractionAt: -1 });
