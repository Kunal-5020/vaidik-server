import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type WakeUpCallDocument = WakeUpCall & Document;

@Schema({ timestamps: true })
export class WakeUpCall {
  @Prop({ required: true, enum: ['user_request', 'astrologer_accept'] })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  fromUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  toUserId: Types.ObjectId;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true, enum: ['call', 'chat'] })
  requestType: string;

  @Prop({ required: true, enum: ['sent', 'opened', 'expired'], default: 'sent' })
  status: string;

  @Prop({ required: true, default: Date.now })
  sentAt: Date;

  @Prop()
  openedAt?: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({
    type: {
      title: String,
      body: String,
      sound: String,
      data: MongooseSchema.Types.Mixed
    }
  })
  notificationData: {
    title: string;
    body: string;
    sound: string;
    data: any;
  };
}

export const WakeUpCallSchema = SchemaFactory.createForClass(WakeUpCall);

// Indexes
WakeUpCallSchema.index({ toUserId: 1, status: 1 });
WakeUpCallSchema.index({ sessionId: 1 });
WakeUpCallSchema.index({ sentAt: -1 });
WakeUpCallSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Auto-expire after 30 seconds
WakeUpCallSchema.pre('save', function(next) {
  if (this.isNew) {
    this.expiresAt = new Date(Date.now() + 30000); // 30 seconds
  }
  next();
});
