import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RegistrationDocument = Registration & Document;

export enum RegistrationStatus {
  WAITLIST = 'waitlist',
  SHORTLISTED = 'shortlisted',
  INTERVIEW_ROUND_1 = 'interview_round_1',
  INTERVIEW_ROUND_2 = 'interview_round_2',
  INTERVIEW_ROUND_3 = 'interview_round_3',
  INTERVIEW_ROUND_4 = 'interview_round_4',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export enum InterviewStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

@Schema({ timestamps: true })
export class Registration {
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

  @Prop({ type: [String], required: true })
  languagesKnown: string[];

  @Prop({ type: [String], required: true })
  skills: string[];

  @Prop({ required: true })
  profilePicture: string;

  @Prop({ maxlength: 1000 })
  bio?: string;

  // Unique ticket number for tracking
  @Prop({ unique: true })
  ticketNumber: string;

  // Current onboarding status
  @Prop({ 
    type: String, 
    enum: Object.values(RegistrationStatus),
    default: RegistrationStatus.WAITLIST 
  })
  status: RegistrationStatus;

  // Waitlist information
  @Prop({
    type: {
      joinedAt: { type: Date, default: Date.now },
      position: Number,
      estimatedWaitTime: String
    }
  })
  waitlist: {
    joinedAt: Date;
    position: number;
    estimatedWaitTime: string;
  };

  // Interview tracking
  @Prop({
    type: {
      round1: {
        status: { type: String, enum: Object.values(InterviewStatus), default: InterviewStatus.PENDING },
        type: { type: String, default: 'profile_review' },
        scheduledAt: Date,
        completedAt: Date,
        conductedBy: { type: Types.ObjectId, ref: 'Admin' },
        notes: String,
        rating: Number,
        passed: { type: Boolean, default: false }
      },
      round2: {
        status: { type: String, enum: Object.values(InterviewStatus), default: InterviewStatus.PENDING },
        type: { type: String, default: 'audio_call' },
        scheduledAt: Date,
        completedAt: Date,
        callDuration: Number,
        conductedBy: { type: Types.ObjectId, ref: 'Admin' },
        callSessionId: String,
        notes: String,
        rating: Number,
        passed: { type: Boolean, default: false }
      },
      round3: {
        status: { type: String, enum: Object.values(InterviewStatus), default: InterviewStatus.PENDING },
        type: { type: String, default: 'video_call' },
        scheduledAt: Date,
        completedAt: Date,
        callDuration: Number,
        conductedBy: { type: Types.ObjectId, ref: 'Admin' },
        callSessionId: String,
        notes: String,
        rating: Number,
        passed: { type: Boolean, default: false }
      },
      round4: {
        status: { type: String, enum: Object.values(InterviewStatus), default: InterviewStatus.PENDING },
        type: { type: String, default: 'final_verification' },
        scheduledAt: Date,
        completedAt: Date,
        verifiedBy: { type: Types.ObjectId, ref: 'Admin' },
        finalNotes: String,
        approved: { type: Boolean, default: false }
      }
    },
    default: () => ({
      round1: { status: InterviewStatus.PENDING, type: 'profile_review', passed: false },
      round2: { status: InterviewStatus.PENDING, type: 'audio_call', passed: false },
      round3: { status: InterviewStatus.PENDING, type: 'video_call', passed: false },
      round4: { status: InterviewStatus.PENDING, type: 'final_verification', approved: false }
    })
  })
  interviews: {
    round1: any;
    round2: any;
    round3: any;
    round4: any;
  };

  // Approval details
  @Prop({
    type: {
      approvedAt: Date,
      approvedBy: { type: Types.ObjectId, ref: 'Admin' },
      adminNotes: String,
      astrologerId: { type: Types.ObjectId, ref: 'Astrologer' }, // Reference to created astrologer profile
      canLogin: { type: Boolean, default: false }
    }
  })
  approval?: {
    approvedAt: Date;
    approvedBy: Types.ObjectId;
    adminNotes: string;
    astrologerId: Types.ObjectId;
    canLogin: boolean;
  };

  // Rejection details (if applicable)
  @Prop({
    type: {
      rejectedAt: Date,
      rejectedBy: { type: Types.ObjectId, ref: 'Admin' },
      reason: String,
      canReapply: { type: Boolean, default: false },
      reapplyAfter: Date
    }
  })
  rejection?: {
    rejectedAt: Date;
    rejectedBy: Types.ObjectId;
    reason: string;
    canReapply: boolean;
    reapplyAfter: Date;
  };

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const RegistrationSchema = SchemaFactory.createForClass(Registration);

// Indexes
RegistrationSchema.index({ phoneNumber: 1 });
RegistrationSchema.index({ email: 1 });
RegistrationSchema.index({ ticketNumber: 1 });
RegistrationSchema.index({ status: 1 });
RegistrationSchema.index({ createdAt: -1 });
