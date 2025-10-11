import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AstrologerDocument = Astrologer & Document;

// Onboarding Status Enum
export enum AstrologerOnboardingStatus {
  WAITLIST = 'waitlist',
  SHORTLISTED = 'shortlisted',
  INTERVIEW_ROUND_1 = 'interview_round_1',
  INTERVIEW_ROUND_2 = 'interview_round_2',
  INTERVIEW_ROUND_3 = 'interview_round_3',
  INTERVIEW_ROUND_4 = 'interview_round_4',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended'
}

@Schema({ timestamps: true })
export class Astrologer {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop()
  email?: string;

  // Bio (Already have, keeping it)
  @Prop({ maxlength: 1000 })
  bio: string;

  @Prop()
  profilePicture?: string;

  // ✅ NEW: Photo Gallery (AWS S3)
  @Prop({
    type: {
      photos: [{
        url: { type: String, required: true },
        key: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        order: { type: Number, default: 0 },
        isApproved: { type: Boolean, default: false }
      }],
      maxPhotos: { type: Number, default: 10 }
    },
    default: () => ({ photos: [], maxPhotos: 10 })
  })
  gallery: {
    photos: {
      url: string;
      key: string;
      uploadedAt: Date;
      order: number;
      isApproved: boolean;
    }[];
    maxPhotos: number;
  };

  // ✅ NEW: Intro Audio Message (AWS S3)
  @Prop({
    type: {
      url: String,
      key: String,
      duration: Number,
      uploadedAt: Date,
      isApproved: { type: Boolean, default: false }
    }
  })
  introAudio?: {
    url: string;
    key: string;
    duration: number;
    uploadedAt: Date;
    isApproved: boolean;
  };

  @Prop({ required: true })
  experienceYears: number;

  @Prop({ type: [String], required: true })
  specializations: string[];

  @Prop({ type: [String], required: true })
  languages: string[];

  // Pricing
  @Prop({
    type: {
      chat: { type: Number, required: true },
      call: { type: Number, required: true },
      videoCall: { type: Number, default: 0 }
    },
    required: true
  })
  pricing: {
    chat: number;
    call: number;
    videoCall: number;
  };

  // ✅ NEW: Enhanced Onboarding Flow
  @Prop({
    type: {
      status: { 
        type: String, 
        enum: Object.values(AstrologerOnboardingStatus),
        default: AstrologerOnboardingStatus.WAITLIST 
      },
      ticketNumber: String,
      
      waitlist: {
        joinedAt: Date,
        position: Number,
        estimatedWaitTime: String
      },
      
      shortlist: {
        shortlistedAt: Date,
        shortlistedBy: { type: Types.ObjectId, ref: 'Admin' },
        notes: String
      },
      
      interviews: {
        round1: {
          status: { type: String, enum: ['pending', 'scheduled', 'completed', 'failed'], default: 'pending' },
          type: { type: String, default: 'profile_review' },
          scheduledAt: Date,
          completedAt: Date,
          conductedBy: { type: Types.ObjectId, ref: 'Admin' },
          notes: String,
          rating: Number,
          documents: [{
            type: { type: String },
            url: String,
            verified: Boolean
          }]
        },
        round2: {
          status: { type: String, enum: ['pending', 'scheduled', 'completed', 'failed'], default: 'pending' },
          type: { type: String, default: 'audio_call' },
          scheduledAt: Date,
          completedAt: Date,
          callDuration: Number,
          conductedBy: { type: Types.ObjectId, ref: 'Admin' },
          callSessionId: String,
          notes: String,
          rating: Number
        },
        round3: {
          status: { type: String, enum: ['pending', 'scheduled', 'completed', 'failed'], default: 'pending' },
          type: { type: String, default: 'video_call' },
          scheduledAt: Date,
          completedAt: Date,
          callDuration: Number,
          conductedBy: { type: Types.ObjectId, ref: 'Admin' },
          callSessionId: String,
          notes: String,
          rating: Number
        },
        round4: {
          status: { type: String, enum: ['pending', 'scheduled', 'completed', 'failed'], default: 'pending' },
          type: { type: String, default: 'final_verification' },
          scheduledAt: Date,
          completedAt: Date,
          verifiedBy: { type: Types.ObjectId, ref: 'Admin' },
          finalNotes: String,
          approved: Boolean
        }
      },
      
      approval: {
        approvedAt: Date,
        approvedBy: { type: Types.ObjectId, ref: 'Admin' },
        canLogin: { type: Boolean, default: false }
      }
    },
    default: () => ({
      status: AstrologerOnboardingStatus.WAITLIST,
      interviews: {
        round1: { status: 'pending', type: 'profile_review' },
        round2: { status: 'pending', type: 'audio_call' },
        round3: { status: 'pending', type: 'video_call' },
        round4: { status: 'pending', type: 'final_verification' }
      }
    })
  })
  onboarding: {
    status: AstrologerOnboardingStatus;
    ticketNumber?: string;
    waitlist?: {
      joinedAt: Date;
      position: number;
      estimatedWaitTime: string;
    };
    shortlist?: {
      shortlistedAt: Date;
      shortlistedBy: Types.ObjectId;
      notes: string;
    };
    interviews: {
      round1: any;
      round2: any;
      round3: any;
      round4: any;
    };
    approval?: {
      approvedAt: Date;
      approvedBy: Types.ObjectId;
      canLogin: boolean;
    };
  };

  // Ratings & Reviews
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

  // Statistics
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

  // ✅ ENHANCED: Availability with Real-time Status
  @Prop({
    type: {
      isOnline: { type: Boolean, default: false },
      isAvailable: { type: Boolean, default: false },
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
      workingHours: []
    })
  })
  availability: {
    isOnline: boolean;
    isAvailable: boolean;
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

  @Prop()
  suspensionReason?: string;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  suspendedBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AstrologerSchema = SchemaFactory.createForClass(Astrologer);

// ✅ CRITICAL INDEXES
AstrologerSchema.index({ userId: 1 }, { unique: true });
AstrologerSchema.index({ phoneNumber: 1 }, { unique: true });
AstrologerSchema.index({ 'onboarding.status': 1 });
AstrologerSchema.index({ accountStatus: 1, 'availability.isOnline': 1 });
AstrologerSchema.index({ specializations: 1 });
AstrologerSchema.index({ 'ratings.average': -1 });
AstrologerSchema.index({ 'onboarding.ticketNumber': 1 }, { sparse: true });
AstrologerSchema.index({ createdAt: -1 });

// Virtual for recent orders (query from CallSession/ChatSession)
AstrologerSchema.virtual('recentOrders', {
  ref: 'CallSession',
  localField: '_id',
  foreignField: 'astrologerId',
  options: { sort: { createdAt: -1 }, limit: 10 }
});
