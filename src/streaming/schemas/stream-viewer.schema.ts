import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreamViewerDocument = StreamViewer & Document;

@Schema({ timestamps: true, collection: 'stream_viewers' })
export class StreamViewer {
  @Prop({ required: true, index: true })
  streamId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop()
  leftAt?: Date;

  @Prop({ default: 0 })
  watchTime: number; // in seconds

  @Prop({ default: 0 })
  giftsGiven: number;

  @Prop({ default: 0 })
  totalSpent: number;

  @Prop({ default: false })
  hasLiked: boolean;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ default: true })
  isActive: boolean; // Currently watching

  @Prop()
  agoraUid?: number; // Viewer's Agora UID
}

export const StreamViewerSchema = SchemaFactory.createForClass(StreamViewer);

// Indexes
StreamViewerSchema.index({ streamId: 1, userId: 1 }, { unique: true });
StreamViewerSchema.index({ streamId: 1, isActive: 1 });
StreamViewerSchema.index({ userId: 1, joinedAt: -1 });
