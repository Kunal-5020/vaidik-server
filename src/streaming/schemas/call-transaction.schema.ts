import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallTransactionDocument = CallTransaction & Document;

@Schema({ timestamps: true, collection: 'call_transactions' })
export class CallTransaction {
  @Prop({ required: true, index: true })
  streamId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['voice', 'video'] })
  callType: string;

  @Prop({ required: true, enum: ['public', 'private'] })
  callMode: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  duration: number; // seconds

  @Prop({ required: true })
  pricePerMinute: number;

  @Prop({ default: 0 })
  totalCharge: number;

  @Prop({ 
    enum: ['completed', 'cancelled', 'failed'],
    default: 'completed'
  })
  status: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const CallTransactionSchema = SchemaFactory.createForClass(CallTransaction);

// Indexes
CallTransactionSchema.index({ streamId: 1, userId: 1 });
CallTransactionSchema.index({ astrologerId: 1, createdAt: -1 });
CallTransactionSchema.index({ userId: 1, createdAt: -1 });
CallTransactionSchema.index({ status: 1 });
