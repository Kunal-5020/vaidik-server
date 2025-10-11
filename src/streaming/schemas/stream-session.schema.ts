import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreamSessionDocument = StreamSession & Document;

@Schema({ timestamps: true, collection: 'stream_sessions' })
export class StreamSession {
  @Prop({ required: true, unique: true, index: true })
  streamId: string; // "STREAM_20251002_ABC123"

  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer', index: true })
  hostId: Types.ObjectId; // Astrologer hosting the stream

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ maxlength: 1000 })
  description?: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ 
    required: true,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled',
    index: true
  })
  status: string;

  @Prop({ 
    required: true,
    enum: ['free', 'paid'],
    default: 'free'
  })
  streamType: string;

  @Prop({ default: 0 })
  entryFee: number; // For paid streams

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  duration: number; // in seconds

  // Agora Details
  @Prop()
  agoraChannelName?: string;

  @Prop()
  agoraToken?: string;

  @Prop()
  agoraHostUid?: number;

  @Prop()
  agoraResourceId?: string; // For recording

  @Prop()
  agoraSid?: string; // Recording session ID

  // Recording
  @Prop({ default: false })
  isRecorded: boolean;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingS3Key?: string;

  // Analytics
  @Prop({ default: 0 })
  viewerCount: number; // Current viewers

  @Prop({ default: 0 })
  peakViewers: number; // Maximum concurrent viewers

  @Prop({ default: 0 })
  totalViews: number; // Total unique viewers

  @Prop({ default: 0 })
  totalWatchTime: number; // Total watch time in seconds

  @Prop({ default: 0 })
  totalLikes: number;

  @Prop({ default: 0 })
  totalComments: number;

  @Prop({ default: 0 })
  totalGifts: number;

  @Prop({ default: 0 })
  totalRevenue: number; // From gifts and entry fees

  // Stream Settings
  @Prop({ default: true })
  allowComments: boolean;

  @Prop({ default: true })
  allowGifts: boolean;

  @Prop({ default: false })
  isPrivate: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  invitedUsers?: Types.ObjectId[]; // For private streams

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const StreamSessionSchema = SchemaFactory.createForClass(StreamSession);

// Indexes
StreamSessionSchema.index({ streamId: 1 }, { unique: true });
StreamSessionSchema.index({ hostId: 1, createdAt: -1 });
StreamSessionSchema.index({ status: 1, scheduledAt: 1 });
StreamSessionSchema.index({ status: 1, viewerCount: -1 });
StreamSessionSchema.index({ agoraChannelName: 1 }, { sparse: true });
StreamSessionSchema.index({ createdAt: -1 });
