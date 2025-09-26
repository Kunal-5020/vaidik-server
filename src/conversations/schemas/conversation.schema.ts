import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({
  timestamps: true,
  collection: 'conversations',
})
export class Conversation {
  @Prop({ 
    required: true,
    unique: true,
    index: true
  })
  conversationId: string; // Unique conversation ID

  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  })
  userId: Types.ObjectId;

  @Prop({ 
    type: Types.ObjectId, 
    ref: 'Astrologer', 
    required: true,
    index: true
  })
  astrologerId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['chat', 'call'],
    index: true
  })
  type: string;

  @Prop({ 
    required: true,
    enum: ['waiting', 'active', 'ended', 'cancelled'],
    default: 'waiting',
    index: true
  })
  status: string;

  // === TIMING ===
  @Prop({ 
    required: false 
  })
  startedAt?: Date;

  @Prop({ 
    required: false 
  })
  endedAt?: Date;

  @Prop({ 
    required: true,
    default: 0
  })
  durationMinutes: number;

  // === PRICING ===
  @Prop({ 
    required: true,
    min: 0
  })
  ratePerMinute: number;

  @Prop({ 
    required: true,
    default: 0,
    min: 0
  })
  totalAmount: number;

  // === MESSAGES (AstroTalk Style) ===
  @Prop({ 
    type: [{
      messageId: { type: String, required: true },
      senderId: { type: Types.ObjectId, required: true }, // User or Astrologer
      senderType: { type: String, enum: ['user', 'astrologer'], required: true },
      content: { type: String, required: true, maxlength: 1000 },
      messageType: { 
        type: String, 
        enum: ['text', 'image', 'kundli', 'remedy'], 
        default: 'text' 
      },
      imageUrl: String, // For image messages
      timestamp: { type: Date, default: Date.now },
      readAt: Date
    }],
    default: []
  })
  messages: {
    messageId: string;
    senderId: Types.ObjectId;
    senderType: string;
    content: string;
    messageType: string;
    imageUrl?: string;
    timestamp: Date;
    readAt?: Date;
  }[];

  // === CALL DETAILS (For call type) ===
  @Prop({ 
    type: {
      callId: String,
      agoraChannelName: String,
      callStartedAt: Date,
      callEndedAt: Date,
      callDurationSeconds: Number,
      callQuality: { type: Number, min: 1, max: 5 } // User rating of call quality
    },
    required: false
  })
  callDetails?: {
    callId: string;
    agoraChannelName: string;
    callStartedAt: Date;
    callEndedAt: Date;
    callDurationSeconds: number;
    callQuality?: number;
  };

  // === FEEDBACK (AstroTalk Style) ===
  @Prop({ 
    type: {
      userRating: { type: Number, min: 1, max: 5 },
      userReview: { type: String, maxlength: 500 },
      astrologerRating: { type: Number, min: 1, max: 5 },
      astrologerReview: { type: String, maxlength: 500 },
      ratedAt: Date
    },
    required: false
  })
  feedback?: {
    userRating?: number;
    userReview?: string;
    astrologerRating?: number;
    astrologerReview?: string;
    ratedAt?: Date;
  };

  // === TRANSACTION LINK ===
  @Prop({ 
    type: Types.ObjectId, 
    ref: 'Transaction',
    required: false
  })
  transactionId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// === INDEXES FOR ASTROTALK CLONE ===
ConversationSchema.index({ conversationId: 1 });
ConversationSchema.index({ userId: 1 });
ConversationSchema.index({ astrologerId: 1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ status: 1 });
ConversationSchema.index({ createdAt: -1 });
ConversationSchema.index({ startedAt: -1 });

// Compound indexes for AstroTalk queries
ConversationSchema.index({ userId: 1, status: 1 });
ConversationSchema.index({ astrologerId: 1, status: 1 });
ConversationSchema.index({ userId: 1, createdAt: -1 });
ConversationSchema.index({ astrologerId: 1, createdAt: -1 });
ConversationSchema.index({ type: 1, status: 1 });
