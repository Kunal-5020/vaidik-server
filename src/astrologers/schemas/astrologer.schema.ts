import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AstrologerDocument = Astrologer & Document;

@Schema({ timestamps: true })
export class Astrologer {
  // Reference to Registration (for tracking)
  @Prop({ type: Types.ObjectId, ref: 'Registration', required: true })
  registrationId: Types.ObjectId;

  // Basic Info (copied from registration)
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  phoneNumber: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  dateOfBirth: Date;

  @Prop({ enum: ['male', 'female', 'other'], required: true })
  gender: string;

  @Prop({ maxlength: 1000 })
  bio: string;

  @Prop()
  profilePicture?: string;

  // Profile completion status
  @Prop({
    type: {
      isComplete: { type: Boolean, default: false },
      completedAt: Date,
      steps: {
        basicInfo: { type: Boolean, default: true }, // Already filled from registration
        expertise: { type: Boolean, default: true }, // Already filled from registration
        pricing: { type: Boolean, default: false },
        availability: { type: Boolean, default: false }
      }
    },
    default: () => ({
      isComplete: false,
      steps: {
        basicInfo: true,
        expertise: true,
        pricing: false,
        availability: false
      }
    })
  })
  profileCompletion: {
    isComplete: boolean;
    completedAt?: Date;
    steps: {
      basicInfo: boolean;
      expertise: boolean;
      pricing: boolean;
      availability: boolean;
    };
  };

  @Prop({ required: true, default: 0 })
  experienceYears: number;

  @Prop({ type: [String], required: true })
  specializations: string[];

  @Prop({ type: [String], required: true })
  languages: string[];

  @Prop({
    type: {
      chat: { type: Number, required: true, default: 0 },
      call: { type: Number, required: true, default: 0 },
      videoCall: { type: Number, default: 0 }
    },
    required: true
  })
  pricing: {
    chat: number;
    call: number;
    videoCall: number;
  };

  // Ratings
  @Prop({
    type: {
      average: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      breakdown: {
        5: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        1: { type: Number, default: 0 }
      }
    },
    default: () => ({
      average: 0,
      total: 0,
      breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    })
  })
  ratings: {
    average: number;
    total: number;
    breakdown: {
      5: number;
      4: number;
      3: number;
      2: number;
      1: number;
    };
  };

  // Stats
  @Prop({
    type: {
      totalEarnings: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      totalOrders: { type: Number, default: 0 },
      callOrders: { type: Number, default: 0 },
      chatOrders: { type: Number, default: 0 },
      repeatCustomers: { type: Number, default: 0 }
    },
    default: () => ({
      totalEarnings: 0,
      totalMinutes: 0,
      totalOrders: 0,
      callOrders: 0,
      chatOrders: 0,
      repeatCustomers: 0
    })
  })
  stats: {
    totalEarnings: number;
    totalMinutes: number;
    totalOrders: number;
    callOrders: number;
    chatOrders: number;
    repeatCustomers: number;
  };

  // Earnings
  @Prop({
    type: {
      totalEarned: { type: Number, default: 0 },
      platformCommission: { type: Number, default: 20 },
      withdrawableAmount: { type: Number, default: 0 }
    },
    default: () => ({
      totalEarned: 0,
      platformCommission: 20,
      withdrawableAmount: 0
    })
  })
  earnings: {
    totalEarned: number;
    platformCommission: number;
    withdrawableAmount: number;
  };

  // Availability & Live Status
  @Prop({
    type: {
      isOnline: { type: Boolean, default: false },
      isAvailable: { type: Boolean, default: false },
      isLive: { type: Boolean, default: false }, // ✅ NEW: Live streaming status
      liveStreamId: String, // ✅ NEW: Current live stream session ID
      busyUntil: Date,
      lastActive: Date,
      workingHours: [{
        day: { 
          type: String, 
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] 
        },
        slots: [{
          start: String,
          end: String,
          isActive: { type: Boolean, default: true }
        }]
      }]
    },
    default: () => ({
      isOnline: false,
      isAvailable: false,
      isLive: false,
      workingHours: []
    })
  })
  availability: {
    isOnline: boolean;
    isAvailable: boolean;
    isLive: boolean;
    liveStreamId?: string;
    busyUntil?: Date;
    lastActive?: Date;
    workingHours: {
      day: string;
      slots: {
        start: string;
        end: string;
        isActive: boolean;
      }[];
    }[];
  };

  @Prop({ default: 'active', enum: ['active', 'suspended', 'inactive'] })
  accountStatus: string;

  @Prop({ default: true })
  isChatEnabled: boolean;

  @Prop({ default: true })
  isCallEnabled: boolean;

  @Prop({ default: true })
  isLiveStreamEnabled: boolean;

  @Prop()
  suspensionReason?: string;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  suspendedBy?: Types.ObjectId;

@Prop({
    type: [
      {
        fcmToken: { type: String, required: true },
        deviceId: String,
        deviceType: { type: String, enum: ['android', 'ios', 'web', 'phone', 'tablet'] },
        deviceName: String,
        lastActive: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true },
      },
    ],
    default: [],
  })
  devices: {
    fcmToken: string;
    deviceId?: string;
    deviceType?: 'android' | 'ios' | 'web' | 'phone' | 'tablet';
    deviceName?: string;
    lastActive: Date;
    isActive: boolean;
  }[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AstrologerSchema = SchemaFactory.createForClass(Astrologer);

// Indexes
AstrologerSchema.index({ userId: 1 }, { unique: true });
AstrologerSchema.index({ registrationId: 1 });
// Unique index for phoneNumber is created via @Prop({ unique: true })
AstrologerSchema.index({ accountStatus: 1, 'availability.isOnline': 1 });
AstrologerSchema.index({ 'availability.isLive': 1 }); // ✅ NEW: For finding live astrologers
AstrologerSchema.index({ specializations: 1 });
AstrologerSchema.index({ 'ratings.average': -1 });
AstrologerSchema.index({ createdAt: -1 });
