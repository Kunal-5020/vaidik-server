import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({
  timestamps: true,
  collection: 'orders',
})
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderId: string; // "ORD_20251002_ABC123"

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

  @Prop()
  callSessionId?: string; // Reference to CallSession

  @Prop()
  chatSessionId?: string; // Reference to ChatSession

  @Prop({ default: 0 })
  duration: number; // minutes

  @Prop({ required: true })
  ratePerMinute: number;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ 
    required: true,
    enum: ['pending', 'ongoing', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  })
  status: string;

  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  @Prop()
  chatId?: string;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ maxlength: 500 })
  review?: string;

  @Prop({ default: false })
  reviewSubmitted: boolean;

  @Prop({
    type: {
      transactionId: String,
      paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'refunded', 'failed'],
        default: 'pending'
      },
      paidAt: Date,
      refundedAt: Date,
      refundAmount: Number
    }
  })
  payment?: {
    transactionId?: string;
    paymentStatus: string;
    paidAt?: Date;
    refundedAt?: Date;
    refundAmount?: number;
  };

  @Prop()
  cancellationReason?: string;

  @Prop()
  cancelledBy?: string; // 'user' | 'astrologer' | 'system'

  @Prop()
  cancelledAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Indexes
OrderSchema.index({ orderId: 1 }, { unique: true }); // ✅ Keep
OrderSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 }); // ✅ MAIN USER QUERY INDEX
OrderSchema.index({ astrologerId: 1, type: 1, status: 1, createdAt: -1 }); // ✅ MAIN ASTROLOGER INDEX
OrderSchema.index({ callSessionId: 1 }, { sparse: true }); // ✅ Keep
OrderSchema.index({ chatSessionId: 1 }, { sparse: true }); // ✅ Keep
OrderSchema.index({ 'payment.paymentStatus': 1, createdAt: -1 }, { sparse: true });
