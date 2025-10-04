import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  // === AUTHENTICATION (Phone Only) ===
  @Prop({ 
    required: true, 
    unique: true, 
    validate: {
      validator: function(v: string) {
        return /^(\+\d{10,15}|\d{10,15})$/.test(v);
      },
      message: 'Invalid phone number format'
    }
  })
  phoneNumber: string;

  // Add to User schema in src/users/schemas/user.schema.ts
  @Prop({ 
    required: false,
    default: '91' // Default to India
  })
  countryCode?: string;


  @Prop({ 
    required: true, 
    unique: true, 
  })
  phoneHash: string;

  @Prop({ 
    required: true,
    default: false 
  })
  isPhoneVerified: boolean;

  // === BASIC PROFILE (AstroTalk Style) ===
  @Prop({ 
    required: false,
    trim: true,
    maxlength: 100
  })
  name?: string;

  @Prop({ 
    required: false,
    enum: ['male', 'female', 'other'],
  })
  gender?: string;

  @Prop({ 
    required: false 
  })
  dateOfBirth?: Date;

  @Prop({ 
    required: false,
    validate: {
      validator: function(v: string) {
        return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Time should be in HH:MM format'
    }
  })
  timeOfBirth?: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 200
  })
  placeOfBirth?: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 300
  })
  currentAddress?: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 100
  })
  city?: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 100
  })
  state?: string;

  @Prop({ 
    required: false,
    trim: true,
    maxlength: 100
  })
  country?: string;

  @Prop({ 
    required: false,
    validate: {
      validator: function(v: string) {
        return !v || /^[1-9][0-9]{5}$/.test(v);
      },
      message: 'Invalid pincode format'
    }
  })
  pincode?: string;

  @Prop({ 
    required: false 
  })
  profileImage?: string;

  @Prop({ required: false })
  profileImageS3Key?: string; // Store S3 key for deletion

  @Prop({ required: false, enum: ['local', 's3'], default: 'local' })
  profileImageStorageType?: string;

  // === APP LANGUAGE (AstroTalk has this) ===
  @Prop({ 
    required: false,
    enum: ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur'],
    default: 'en'
  })
  appLanguage: string;

  // === NOTIFICATION SETTINGS (Simple like AstroTalk) ===
  @Prop({ 
    type: {
      liveEvents: { type: Boolean, default: false },
      normal: { type: Boolean, default: false }
    },
    default: () => ({
      liveEvents: true,
      normal: true
    })
  })
  notifications: {
    liveEvents: boolean;
    normal: boolean;
  };

  // === PRIVACY SETTINGS (AstroTalk Clone) ===
  @Prop({ 
    type: {
      nameVisibleInReviews: { type: Boolean, default: false },
      restrictions: {
        astrologerChatAccessAfterEnd: { type: Boolean, default: true },
        downloadSharedImages: { type: Boolean, default: true },
        restrictChatScreenshots: { type: Boolean, default: true },
        accessCallRecording: { type: Boolean, default: true }
      }
    },
    default: () => ({
      nameVisibleInReviews: true,
      restrictions: {
        astrologerChatAccessAfterEnd: true,
        downloadSharedImages: true,
        restrictChatScreenshots: true,
        accessCallRecording: true
      }
    })
  })
  privacy: {
    nameVisibleInReviews: boolean;
    restrictions: {
      astrologerChatAccessAfterEnd: boolean;
      downloadSharedImages: boolean;
      restrictChatScreenshots: boolean;
      accessCallRecording: boolean;
    };
  };

  // === WALLET SYSTEM (Exactly like AstroTalk) ===
  @Prop({ 
    type: {
      balance: { type: Number, default: 0, min: 0 },
      totalRecharged: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      lastRechargeAt: { type: Date },
      lastTransactionAt: { type: Date }
    },
    default: () => ({
      balance: 0,
      totalRecharged: 0,
      totalSpent: 0
    })
  })
  wallet: {
    balance: number;
    totalRecharged: number;
    totalSpent: number;
    lastRechargeAt?: Date;
    lastTransactionAt?: Date;
  };

  // === CHAT/CALL ORDERS (AstroTalk's main feature) ===
  @Prop({ 
    type: [{
      orderId: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['chat', 'call'], // AstroTalk mainly has these 2
        required: true 
      },
      astrologerId: { type: Types.ObjectId, ref: 'Astrologer', required: true },
      astrologerName: { type: String, required: true },
      duration: { type: Number, default: 0 }, // in minutes
      ratePerMinute: { type: Number, required: true },
      totalAmount: { type: Number, required: true },
      status: { 
        type: String, 
        enum: ['pending', 'ongoing', 'completed', 'cancelled'], 
        default: 'pending' 
      },
      startTime: { type: Date },
      endTime: { type: Date },
      chatId: { type: String }, // Chat session ID
      rating: { type: Number, min: 1, max: 5 },
      review: { type: String, maxlength: 500 },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  orders: {
    orderId: string;
    type: string;
    astrologerId: Types.ObjectId;
    astrologerName: string;
    duration: number;
    ratePerMinute: number;
    totalAmount: number;
    status: string;
    startTime?: Date;
    endTime?: Date;
    chatId?: string;
    rating?: number;
    review?: string;
    createdAt: Date;
  }[];

  // === WALLET TRANSACTIONS (AstroTalk Style) ===
  @Prop({ 
    type: [{
      transactionId: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['recharge', 'deduction', 'refund'], 
        required: true 
      },
      amount: { type: Number, required: true },
      description: { type: String, required: true }, // "Chat with Astrologer for 2 mins"
      orderId: { type: String }, // Links to orders
      balanceAfter: { type: Number, required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  walletTransactions: {
    transactionId: string;
    type: string;
    amount: number;
    description: string;
    orderId?: string;
    balanceAfter: number;
    createdAt: Date;
  }[];

  // === REMEDIES (AstroTalk has this) ===
  @Prop({ 
    type: [{
      remedyId: { type: String, required: true },
      orderId: { type: String, required: true },
      astrologerId: { type: Types.ObjectId, ref: 'Astrologer', required: true },
      astrologerName: { type: String, required: true },
      title: { type: String, required: true, maxlength: 200 },
      description: { type: String, required: true, maxlength: 1000 },
      type: { 
        type: String, 
        enum: ['gemstone', 'mantra', 'puja', 'donation', 'yantra', 'other'] 
      },
      status: { 
        type: String, 
        enum: ['suggested', 'accepted', 'rejected'], 
        default: 'suggested' 
      },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  remedies: {
    remedyId: string;
    orderId: string;
    astrologerId: Types.ObjectId;
    astrologerName: string;
    title: string;
    description: string;
    type: string;
    status: string;
    createdAt: Date;
  }[];

  // === REPORTS (Birth Chart, Kundli) ===
  @Prop({ 
    type: [{
      reportId: { type: String, required: true },
      orderId: { type: String, required: true },
      astrologerId: { type: Types.ObjectId, ref: 'Astrologer', required: true },
      type: { 
        type: String, 
        enum: ['kundli', 'yearly_prediction', 'compatibility'], 
        required: true 
      },
      title: { type: String, required: true },
      content: { type: String }, // Report content
      filePath: { type: String }, // PDF path
      status: { 
        type: String, 
        enum: ['pending', 'completed'], 
        default: 'pending' 
      },
      createdAt: { type: Date, default: Date.now },
      deliveredAt: { type: Date }
    }],
    default: []
  })
  reports: {
    reportId: string;
    orderId: string;
    astrologerId: Types.ObjectId;
    type: string;
    title: string;
    content?: string;
    filePath?: string;
    status: string;
    createdAt: Date;
    deliveredAt?: Date;
  }[];

  // === FAVORITES (AstroTalk has this) ===
  @Prop({ 
    type: [{ type: Types.ObjectId, ref: 'Astrologer' }],
    default: []
  })
  favoriteAstrologers: Types.ObjectId[];

  // === BASIC STATS (AstroTalk tracks this) ===
  @Prop({ 
    type: {
      totalSessions: { type: Number, default: 0 },
      totalMinutesSpent: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      totalRatings: { type: Number, default: 0 }
    },
    default: () => ({
      totalSessions: 0,
      totalMinutesSpent: 0,
      totalAmount: 0,
      totalRatings: 0
    })
  })
  stats: {
    totalSessions: number;
    totalMinutesSpent: number;
    totalAmount: number;
    totalRatings: number;
  };

  // === ACCOUNT STATUS ===
  @Prop({ 
    required: true,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  })
  status: string;

  @Prop({ 
    required: false 
  })
  lastLoginAt?: Date;

  @Prop({ 
    required: false 
  })
  lastActiveAt?: Date;

  // === DEVICE INFO (For notifications) ===
  @Prop({ type: [String], default: [] })
  deviceTokens: string[];

  @Prop({ 
    required: false 
  })
  lastIPAddress?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// === INDEXES (AstroTalk Clone Optimized) ===
UserSchema.index({ phoneNumber: 1 });
UserSchema.index({ phoneHash: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'orders.status': 1 });
UserSchema.index({ 'orders.astrologerId': 1 });
UserSchema.index({ favoriteAstrologers: 1 });

// === VIRTUAL FIELDS ===
UserSchema.virtual('totalWalletBalance').get(function() {
  return this.wallet.balance;
});
