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
    enum: ['none', 'rising_star', 'top_choice', 'celebrity'],
    default: 'none',
    index: true
  })
  tier: string;

  @Prop()
  tierAssignedAt?: Date;

  @Prop()
  tierAssignedBy?: Types.ObjectId; // Admin who assigned tier

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

  @Prop({
  type: {
    average: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    approvedReviews: { type: Number, default: 0 }, // ✅ NEW: Only approved shown publicly
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
    approvedReviews: 0,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  })
})
ratings: {
  average: number;
  total: number;
  approvedReviews: number; // ✅ NEW
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
  // ✅ UPDATED: Earnings with proper calculation fields
  @Prop({
    type: {
      totalEarned: { type: Number, default: 0 },           // Total revenue generated
      platformCommission: { type: Number, default: 0 },     // Platform's cut (₹)
      platformCommissionRate: { type: Number, default: 30 }, // Commission rate (%)
      netEarnings: { type: Number, default: 0 },           // totalEarned - platformCommission
      totalPenalties: { type: Number, default: 0 },        // ✅ Total penalties/fines
      withdrawableAmount: { type: Number, default: 0 },    // Available to withdraw
      totalWithdrawn: { type: Number, default: 0 },        // Already withdrawn
      pendingWithdrawal: { type: Number, default: 0 },     // In pending payout requests
      lastUpdated: { type: Date, default: Date.now }
    },
    default: () => ({
      totalEarned: 0,
      platformCommission: 0,
      platformCommissionRate: 30,
      netEarnings: 0,
      totalPenalties: 0,
      withdrawableAmount: 0,
      totalWithdrawn: 0,
      pendingWithdrawal: 0,
      lastUpdated: new Date()
    })
  })
  earnings: {
    totalEarned: number;
    platformCommission: number;
    platformCommissionRate: number;
    netEarnings: number;
    totalPenalties: number;
    withdrawableAmount: number;
    totalWithdrawn: number;
    pendingWithdrawal: number;
    lastUpdated: Date;
  };

  // ✅ NEW: Penalties/Fines tracking
  @Prop({
    type: [{
      penaltyId: { type: String, required: true },
      type: { 
        type: String, 
        enum: [
          'late_response',           // Late to respond to call/chat
          'missed_appointment',      // Missed scheduled session
          'policy_violation',        // Violated platform policies
          'customer_complaint',      // Customer complaint upheld
          'quality_issue',          // Poor service quality
          'no_show',                // Didn't show up for session
          'refund_issued',          // Refund due to astrologer fault
          'inappropriate_behavior',  // Misconduct
          'other'
        ],
        required: true 
      },
      amount: { type: Number, required: true },
      reason: { type: String, required: true },
      description: String,
      orderId: String,                    // Related order if any
      userId: { type: Types.ObjectId, ref: 'User' }, // User who reported
      status: { 
        type: String, 
        enum: ['pending', 'applied', 'waived', 'disputed'],
        default: 'applied'
      },
      appliedBy: { type: Types.ObjectId, ref: 'Admin' },
      appliedAt: { type: Date, default: Date.now },
      waivedBy: { type: Types.ObjectId, ref: 'Admin' },
      waivedAt: Date,
      waiverReason: String,
      disputeNote: String,
      disputedAt: Date,
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  penalties: {
    penaltyId: string;
    type: string;
    amount: number;
    reason: string;
    description?: string;
    orderId?: string;
    userId?: Types.ObjectId;
    status: 'pending' | 'applied' | 'waived' | 'disputed';
    appliedBy?: Types.ObjectId;
    appliedAt?: Date;
    waivedBy?: Types.ObjectId;
    waivedAt?: Date;
    waiverReason?: string;
    disputeNote?: string;
    disputedAt?: Date;
    createdAt: Date;
  }[];

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

  @Prop({ default: true })
singleDeviceMode: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AstrologerSchema = SchemaFactory.createForClass(Astrologer);

// Indexes
AstrologerSchema.index({ registrationId: 1 });
// Unique index for phoneNumber is created via @Prop({ unique: true })
AstrologerSchema.index({ accountStatus: 1, 'availability.isOnline': 1 });
AstrologerSchema.index({ 'availability.isLive': 1 }); // ✅ NEW: For finding live astrologers
AstrologerSchema.index({ specializations: 1 });
AstrologerSchema.index({ 'ratings.average': -1 });
AstrologerSchema.index({ createdAt: -1 });
AstrologerSchema.index({ tier: 1, 'ratings.average': -1 });
AstrologerSchema.index({ tier: 1, isOnline: 1 });
AstrologerSchema.index({ 'penalties.penaltyId': 1 }, { sparse: true });
AstrologerSchema.index({ 'penalties.status': 1 });
