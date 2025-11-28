import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportTicketDocument = SupportTicket & Document;

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ required: true, unique: true, index: true })
  zohoTicketId: string; // Zoho Desk Ticket ID

  @Prop({ required: true })
  ticketNumber: string; // Display number like "12345"

  @Prop({ type: Types.ObjectId, refPath: 'userModel', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['User', 'Astrologer'],
  })
  userModel: string;

  @Prop({ 
    required: true,
    enum: ['refund', 'payout', 'penalty', 'session', 'language', 'guidance', 'privacy', 'general'],
    index: true
  })
  category: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ 
    required: true,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true
  })
  status: string;

  @Prop()
  zohoChatUrl: string; // Direct link to Zoho chat for admin

  // Financial context (for refund/payout tickets)
  @Prop({ type: Types.ObjectId, ref: 'WalletTransaction' })
  transactionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PayoutRequest' })
  payoutId?: Types.ObjectId;

  @Prop()
  requestedAmount?: number;

  // User snapshot (cached for quick admin view)
  @Prop({ 
    type: {
      name: String,
      email: String,
      phone: String,
      walletBalance: Number,
      totalSpent: Number,
    },
    required: true
  })
  userContext: {
    name: string;
    email: string;
    phone: string;
    walletBalance: number;
    totalSpent?: number;
  };

  // Action tracking
  @Prop({ default: false })
  refundProcessed: boolean;

  @Prop()
  refundId?: string; // Razorpay refund ID or wallet transaction ID

  @Prop()
  refundAmount?: number;

  @Prop({ default: false })
  payoutApproved: boolean;

  @Prop()
  processedBy?: Types.ObjectId; // Admin who processed

  @Prop()
  processedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

// Indexes
SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ category: 1, status: 1 });
SupportTicketSchema.index({ status: 1, createdAt: -1 });
