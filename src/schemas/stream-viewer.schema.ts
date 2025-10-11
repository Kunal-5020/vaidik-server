import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class StreamViewer {
  @Prop({ required: true })
  streamId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  profileImage?: string;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop()
  leftAt?: Date;

  @Prop({ default: 0 })
  watchDuration: number; // in seconds

  @Prop({ default: 0 })
  messagesCount: number;

  @Prop({ default: 0 })
  tipsGiven: number;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  lastActivity?: Date;

  @Prop({
    type: {
      country: String,
      city: String,
      device: String,
      platform: String
    }
  })
  metadata?: {
    country?: string;
    city?: string;
    device?: string;
    platform?: string;
  };
}

export type StreamViewerDocument = StreamViewer & Document;
export const StreamViewerSchema = SchemaFactory.createForClass(StreamViewer);

// Indexes for viewers
StreamViewerSchema.index({ streamId: 1, userId: 1 });
StreamViewerSchema.index({ streamId: 1, isActive: 1 });
StreamViewerSchema.index({ userId: 1, joinedAt: -1 });
