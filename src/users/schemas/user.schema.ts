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

  @Prop({ required: true })
  countryCode: string;

  @Prop({ required: true })
  phoneHash: string;

  @Prop({ required: true })
  isPhoneVerified: boolean;

  @Prop({
    required: true,
    enum: ['truecaller', 'otp'],
    default: 'otp'
  })
  registrationMethod: 'truecaller' | 'otp';

  // === BASIC PROFILE ===
  @Prop({ required: false, trim: true, maxlength: 100 })
  name?: string;

  @Prop({ required: false, enum: ['male', 'female', 'other'] })
  gender?: string;

  @Prop({ required: false })
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

  @Prop({ required: false, trim: true, maxlength: 200 })
  placeOfBirth?: string;

  @Prop({ required: false, trim: true, maxlength: 300 })
  currentAddress?: string;

  @Prop({ required: false, trim: true, maxlength: 100 })
  city?: string;

  @Prop({ required: false, trim: true, maxlength: 100 })
  state?: string;

  @Prop({ required: false, trim: true, maxlength: 100 })
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

  @Prop({ required: false, default: 'default' })
  profileImage: string;

  @Prop({ required: false, default: false })
  isProfileComplete: boolean;

  @Prop({ required: false })
  profileImageS3Key?: string;

  @Prop({ required: false, enum: ['local', 's3'], default: 'local' })
  profileImageStorageType?: string;

  // === APP LANGUAGE ===
  @Prop({ 
    required: false,
    enum: ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur'],
    default: 'en'
  })
  appLanguage: string;

  // === NOTIFICATION SETTINGS ===
  @Prop({ 
    type: {
      liveEvents: { type: Boolean, default: true },
      normal: { type: Boolean, default: true }
    },
    default: () => ({ liveEvents: true, normal: true })
  })
  notifications: {
    liveEvents: boolean;
    normal: boolean;
  };

  // === PRIVACY SETTINGS ===
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
      nameVisibleInReviews: false,
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

  // === WALLET SYSTEM (Aggregated Stats Only) ===
  @Prop({ 
    type: {
      balance: { type: Number, default: 0, min: 0 },
      totalRecharged: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      lastRechargeAt: { type: Date, default: null },
      lastTransactionAt: { type: Date, default: null }
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

  // === FAVORITES (Small array - acceptable) ===
  @Prop({ 
    type: [{ type: Types.ObjectId, ref: 'Astrologer' }],
    default: []
  })
  favoriteAstrologers: Types.ObjectId[];

  // === BASIC STATS (Aggregated only) ===
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
    enum: ['active', 'suspended','blocked', 'deleted'],
    default: 'active',
  })
  status: string;

  @Prop({ required: false })
  lastLoginAt?: Date;

  @Prop({ required: false })
  lastActiveAt?: Date;

  // === DEVICE INFO ===
  @Prop({ type: [String], default: [] })
  deviceTokens: string[];

  @Prop({ required: false })
  lastIPAddress?: string;

@Prop({
    type: [
      {
        fcmToken: { type: String, required: true },
        deviceId: String,
        deviceType: { type: String, enum: ['android', 'ios', 'web'] },
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
    deviceType?: 'android' | 'ios' | 'web';
    deviceName?: string;
    lastActive: Date;
    isActive: boolean;
  }[];


  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// === INDEXES ===
UserSchema.index({ phoneNumber: 1, status: 1, createdAt: -1 });
UserSchema.index({ phoneHash: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'devices.fcmToken': 1 });
UserSchema.index({ 'devices.isActive': 1 });

// === VIRTUAL FIELDS (Query from separate collections) ===
UserSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'userId'
});

UserSchema.virtual('transactions', {
  ref: 'WalletTransaction',
  localField: '_id',
  foreignField: 'userId'
});

UserSchema.virtual('remedies', {
  ref: 'Remedy',
  localField: '_id',
  foreignField: 'userId'
});

UserSchema.virtual('reports', {
  ref: 'Report',
  localField: '_id',
  foreignField: 'userId'
});

// === VIRTUAL COMPUTED FIELD ===
UserSchema.virtual('totalWalletBalance').get(function() {
  return this.wallet.balance;
});
