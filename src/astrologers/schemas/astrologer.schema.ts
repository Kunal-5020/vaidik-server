import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AstrologerDocument = Astrologer & Document;

@Schema({
  timestamps: true,
  collection: 'astrologers',
})
export class Astrologer {
  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true,
    index: true
  })
  userId: Types.ObjectId;

  // === BASIC INFORMATION (AstroTalk Style) ===
  @Prop({ 
    required: true,
    trim: true,
    maxlength: 100
  })
  name: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 500
  })
  bio?: string;

  @Prop({ 
    required: true,
    min: 0,
    max: 50
  })
  experienceYears: number;

  @Prop({ 
    required: true,
    type: [String],
    validate: {
      validator: function(v: string[]) {
        const validSpecializations = [
          'Vedic Astrology', 'Numerology', 'Tarot Reading', 'Palmistry',
          'Vastu Shastra', 'Face Reading', 'KP Astrology', 'Lal Kitab',
          'Gemology', 'Marriage Compatibility', 'Career Astrology',
          'Health Astrology', 'Horary Astrology'
        ];
        return v.every(spec => validSpecializations.includes(spec));
      },
      message: 'Invalid specialization'
    }
  })
  specializations: string[];

  @Prop({ 
    required: true,
    type: [String],
    validate: {
      validator: function(v: string[]) {
        const validLanguages = [
          'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi',
          'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'
        ];
        return v.every(lang => validLanguages.includes(lang));
      },
      message: 'Invalid language'
    }
  })
  languages: string[];

  @Prop({ 
    required: false 
  })
  profilePicture?: string;

  // === PRICING (AstroTalk Model) ===
  @Prop({ 
    type: {
      chat: { type: Number, required: true, min: 5, max: 1000 }, // ₹5-₹1000 per minute
      call: { type: Number, required: true, min: 5, max: 1000 }
    },
    required: true
  })
  pricing: {
    chat: number; // Price per minute in INR
    call: number;
  };

  // === AVAILABILITY (AstroTalk Style) ===
  @Prop({ 
    required: true,
    enum: ['online', 'offline', 'busy'],
    default: 'offline',
    index: true
  })
  status: string;

  @Prop({ 
    required: false 
  })
  lastOnlineAt?: Date;

  // === VERIFICATION (AstroTalk Process) ===
  @Prop({ 
    type: {
      isVerified: { type: Boolean, default: false },
      verificationStatus: { 
        type: String, 
        enum: ['pending', 'under_review', 'approved', 'rejected'], 
        default: 'pending' 
      },
      documents: [{
        type: { type: String, enum: ['id_proof', 'address_proof', 'certificate'] },
        url: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        uploadedAt: { type: Date, default: Date.now },
        comments: String
      }],
      verifiedAt: Date,
      rejectionReason: String
    },
    default: () => ({
      isVerified: false,
      verificationStatus: 'pending',
      documents: []
    })
  })
  verification: {
    isVerified: boolean;
    verificationStatus: string;
    documents: {
      type: string;
      url: string;
      status: string;
      uploadedAt: Date;
      comments?: string;
    }[];
    verifiedAt?: Date;
    rejectionReason?: string;
  };

  // === PERFORMANCE STATS (AstroTalk Metrics) ===
  @Prop({ 
    type: {
      totalOrders: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      rating: { type: Number, default: 0, min: 0, max: 5 },
      totalRatings: { type: Number, default: 0 },
      responseTimeSeconds: { type: Number, default: 0 }, // Average response time
      chatOrders: { type: Number, default: 0 },
      callOrders: { type: Number, default: 0 },
      repeatCustomers: { type: Number, default: 0 }
    },
    default: () => ({
      totalOrders: 0,
      totalMinutes: 0,
      totalEarnings: 0,
      rating: 0,
      totalRatings: 0,
      responseTimeSeconds: 0,
      chatOrders: 0,
      callOrders: 0,
      repeatCustomers: 0
    })
  })
  stats: {
    totalOrders: number;
    totalMinutes: number;
    totalEarnings: number;
    rating: number;
    totalRatings: number;
    responseTimeSeconds: number;
    chatOrders: number;
    callOrders: number;
    repeatCustomers: number;
  };

  // === SERVICE SETTINGS (AstroTalk Features) ===
  @Prop({ 
    required: false,
    default: true
  })
  isChatEnabled: boolean;

  @Prop({ 
    required: false,
    default: true
  })
  isCallEnabled: boolean;

  // === WORKING HOURS (Simple AstroTalk Style) ===
  @Prop({ 
    type: [{
      day: { 
        type: String, 
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] 
      },
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      isAvailable: { type: Boolean, default: true }
    }],
    default: []
  })
  workingHours: {
    day: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }[];

  // === EARNINGS & COMMISSION (AstroTalk Model) ===
  @Prop({ 
    type: {
      totalEarned: { type: Number, default: 0 },
      platformCommission: { type: Number, default: 20 }, // 20% like AstroTalk
      withdrawableAmount: { type: Number, default: 0 },
      lastPayoutAt: { type: Date },
      bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String
      }
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
    lastPayoutAt?: Date;
    bankDetails?: {
      accountNumber: string;
      ifscCode: string;
      accountHolderName: string;
      bankName: string;
    };
  };

  // === ACCOUNT STATUS ===
  @Prop({ 
    required: true,
    enum: ['pending', 'active', 'suspended', 'inactive'],
    default: 'pending',
    index: true
  })
  accountStatus: string;

  // === RECENT ACTIVITY ===
  @Prop({ 
    type: [{
      orderId: String,
      userId: { type: Types.ObjectId, ref: 'User' },
      type: { type: String, enum: ['chat', 'call'] },
      duration: Number,
      amount: Number,
      completedAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  recentOrders: {
    orderId: string;
    userId: Types.ObjectId;
    type: string;
    duration: number;
    amount: number;
    completedAt: Date;
  }[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const AstrologerSchema = SchemaFactory.createForClass(Astrologer);

// === INDEXES FOR ASTROTALK CLONE ===
AstrologerSchema.index({ userId: 1 });
AstrologerSchema.index({ status: 1 });
AstrologerSchema.index({ accountStatus: 1 });
AstrologerSchema.index({ specializations: 1 });
AstrologerSchema.index({ languages: 1 });
AstrologerSchema.index({ 'stats.rating': -1 });
AstrologerSchema.index({ 'pricing.chat': 1 });
AstrologerSchema.index({ 'pricing.call': 1 });
AstrologerSchema.index({ experienceYears: -1 });
AstrologerSchema.index({ createdAt: -1 });
AstrologerSchema.index({ 'verification.isVerified': 1 });

// Compound indexes for AstroTalk-style queries
AstrologerSchema.index({ accountStatus: 1, status: 1 });
AstrologerSchema.index({ specializations: 1, 'stats.rating': -1 });
AstrologerSchema.index({ languages: 1, status: 1 });
AstrologerSchema.index({ 'verification.isVerified': 1, status: 1 });
