// src/orders/schemas/orders.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({
  timestamps: true,
  collection: 'orders',
})
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderId: string; // "ORD_20251025_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  astrologerName: string;

  @Prop({ 
    required: true, 
    enum: ['chat', 'call'], 
    index: true 
  })
  type: string;

  // ✅ NEW: Call type (audio/video)
  @Prop({ enum: ['audio', 'video'] })
  callType?: string; // Only for call orders

  // Session references
  @Prop()
  callSessionId?: string;

  @Prop()
  chatSessionId?: string;

  // Duration & Pricing
  @Prop({ default: 0 })
  duration: number; // seconds

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ required: true, default: 0 })
  totalAmount: number;

  // Status
  @Prop({ 
    required: true,
    enum: [
      'pending', 
      'ongoing', 
      'completed', 
      'cancelled',
      'refund_requested',
      'refund_approved',
      'refund_rejected',
      'refunded'
    ],
    default: 'pending',
    index: true
  })
  status: string;

  // Timing
  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  // ✅ NEW: Recording details (for call orders)
  @Prop({ default: false })
  hasRecording: boolean;

  @Prop()
  recordingUrl?: string; // S3 URL

  @Prop()
  recordingS3Key?: string;

  @Prop()
  recordingDuration?: number; // seconds

  @Prop({ enum: ['voice_note', 'video', 'none'], default: 'none' })
  recordingType?: string;

  // Review system
  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ maxlength: 500 })
  review?: string;

  @Prop({ default: false })
  reviewSubmitted: boolean;

  // Payment details
  @Prop({
    type: {
      transactionId: String,
      walletTransactionId: String,
      paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'refunded', 'failed', 'processing'],
        default: 'pending'
      },
      paidAt: Date,
      refundedAt: Date,
      refundAmount: Number,
      refundTransactionId: String
    }
  })
  payment?: {
    transactionId?: string;
    walletTransactionId?: string;
    paymentStatus: string;
    paidAt?: Date;
    refundedAt?: Date;
    refundAmount?: number;
    refundTransactionId?: string;
  };

  // Cancellation
  @Prop()
  cancellationReason?: string;

  @Prop({ enum: ['user', 'astrologer', 'system', 'admin'] })
  cancelledBy?: string;

  @Prop()
  cancelledAt?: Date;

  // ✅ NEW: Refund Request System
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
      processedBy: { type: Types.ObjectId, ref: 'User' }, // Admin
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

  // Soft delete
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  // Metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// ===== OPTIMIZED INDEXES =====
OrderSchema.index({ orderId: 1 }, { unique: true });
OrderSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
OrderSchema.index({ astrologerId: 1, type: 1, status: 1, createdAt: -1 });
OrderSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
OrderSchema.index({ callSessionId: 1 }, { sparse: true });
OrderSchema.index({ chatSessionId: 1 }, { sparse: true });
OrderSchema.index({ 'payment.paymentStatus': 1, createdAt: -1 }, { sparse: true });
OrderSchema.index({ 'refundRequest.status': 1, createdAt: -1 }, { sparse: true });
OrderSchema.index({ status: 1, createdAt: -1 });
