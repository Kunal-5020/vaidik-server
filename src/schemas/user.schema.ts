import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, sparse: true })
  phoneNumber: string;

  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  otp: string;

  @Prop()
  otpExpiry: Date;

  // Profile Information
  @Prop({
    type: {
      name: String,
      email: String,
      gender: { type: String, enum: ['male', 'female', 'other'] },
      dateOfBirth: Date,
      birthTime: String,
      birthPlace: String,
      currentAddress: String,
      profileImage: String,
    }
  })
  profile: {
    name?: string;
    email?: string;
    gender?: string;
    dateOfBirth?: Date;
    birthTime?: string;
    birthPlace?: string;
    currentAddress?: string;
    profileImage?: string;
  };

  // Wallet (NO MORE NESTED TRANSACTIONS ARRAY!)
  @Prop({
    type: {
      balance: { type: Number, default: 0 },
      totalRecharged: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      lastRechargeAt: Date,
      lastTransactionAt: Date,
    },
    default: () => ({
      balance: 0,
      totalRecharged: 0,
      totalSpent: 0,
      currency: 'INR'
    })
  })
  wallet: {
    balance: number;
    totalRecharged: number;
    totalSpent: number;
    currency: string;
    lastRechargeAt?: Date;
    lastTransactionAt?: Date;
  };

  // Device Tokens for Push Notifications
  @Prop({
    type: [{
      token: { type: String, required: true },
      platform: { type: String, enum: ['android', 'ios', 'web'] },
      deviceId: String,
      addedAt: { type: Date, default: Date.now },
      lastUsed: { type: Date, default: Date.now }
    }],
    default: []
  })
  deviceTokens: {
    token: string;
    platform: string;
    deviceId?: string;
    addedAt: Date;
    lastUsed: Date;
  }[];

  // Notification Preferences
  @Prop({
    type: {
      liveEvents: { type: Boolean, default: true },
      normal: { type: Boolean, default: true },
      promotional: { type: Boolean, default: true }
    },
    default: () => ({
      liveEvents: true,
      normal: true,
      promotional: true
    })
  })
  notifications: {
    liveEvents: boolean;
    normal: boolean;
    promotional: boolean;
  };

  // Status
  @Prop({ default: 'active', enum: ['active', 'suspended', 'deleted'] })
  status: string;

  @Prop()
  suspensionReason?: string;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  suspendedBy?: Types.ObjectId;

  @Prop()
  lastActiveAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ✅ CRITICAL INDEXES
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ 'profile.email': 1 }, { sparse: true });
UserSchema.index({ status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1 });

// Virtual for wallet transactions (query from WalletTransaction collection)
UserSchema.virtual('walletTransactions', {
  ref: 'WalletTransaction',
  localField: '_id',
  foreignField: 'userId'
});
