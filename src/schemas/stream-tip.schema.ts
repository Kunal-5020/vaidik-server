import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreamTipDocument = StreamTip & Document;

@Schema({ timestamps: true })
export class StreamTip {
  @Prop({ type: Types.ObjectId, ref: 'LiveStream', required: true })
  streamId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ maxlength: 200 })
  message?: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ default: false })
  isHighlighted: boolean; // For big tips (100+)
}

export const StreamTipSchema = SchemaFactory.createForClass(StreamTip);

// ✅ CRITICAL INDEXES
StreamTipSchema.index({ streamId: 1, createdAt: -1 });
StreamTipSchema.index({ userId: 1, createdAt: -1 });
StreamTipSchema.index({ streamId: 1, amount: -1 }); // For top tippers
StreamTipSchema.index({ createdAt: -1 });
