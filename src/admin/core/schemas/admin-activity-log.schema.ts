import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminActivityLogDocument = AdminActivityLog & Document;

@Schema({ timestamps: true, collection: 'admin_activity_logs' })
export class AdminActivityLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Admin', index: true })
  adminId: Types.ObjectId;

  @Prop({ required: true })
  action: string; // "user.block", "astrologer.approve", "order.refund"

  @Prop({ required: true })
  module: string; // "users", "astrologers", "orders", "payments"

  @Prop()
  targetId?: string; // ID of affected resource

  @Prop()
  targetType?: string; // "User", "Astrologer", "Order"

  @Prop({ type: Object })
  details?: Record<string, any>; // Additional details

  @Prop({ type: Object })
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ 
    required: true,
    enum: ['success', 'failed', 'warning'],
    default: 'success'
  })
  status: string;

  @Prop()
  errorMessage?: string;

  @Prop({ default: Date.now, index: true })
  createdAt: Date;
}

export const AdminActivityLogSchema = SchemaFactory.createForClass(AdminActivityLog);

// Indexes
AdminActivityLogSchema.index({ adminId: 1, createdAt: -1 });
AdminActivityLogSchema.index({ action: 1 });
AdminActivityLogSchema.index({ module: 1 });
AdminActivityLogSchema.index({ targetId: 1 });
AdminActivityLogSchema.index({ createdAt: -1 });
