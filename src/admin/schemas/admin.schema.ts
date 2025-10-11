import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminDocument = Admin & Document;

@Schema({ timestamps: true, collection: 'admins' })
export class Admin extends Document {
  @Prop({ required: true, unique: true, index: true })
  adminId: string; // "ADMIN_001"

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  password: string; // Hashed

  @Prop()
  phoneNumber?: string;

  @Prop()
  profileImage?: string;

  // ✅ Role-based access
  @Prop({ type: Types.ObjectId, ref: 'AdminRole', required: true })
  roleId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['super_admin', 'admin', 'moderator', 'support', 'analyst', 'content_manager'],
    default: 'admin'
  })
  roleType: string;

  // ✅ Granular permissions
  @Prop({ 
    type: [String],
    default: []
  })
  customPermissions: string[]; // Additional permissions beyond role

  @Prop({ 
    type: [String],
    default: []
  })
  deniedPermissions: string[]; // Explicitly denied permissions

  // Status & Security
@Prop({ 
  default: 'active', 
  enum: ['active', 'inactive', 'suspended', 'locked'] // ✅ Make sure 'locked' is here
})
status: string;


  @Prop({ default: false })
  isSuperAdmin: boolean;

  @Prop({ default: false })
  requirePasswordChange: boolean;

  @Prop()
  passwordChangedAt?: Date;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockedUntil?: Date;

  // Activity Tracking
  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop()
  lastActivityAt?: Date;

  // Two-Factor Authentication
  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop()
  twoFactorSecret?: string;

  // Metadata
  @Prop()
  department?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;


@Prop({
  type: {
    approvedAt: Date,
    approvedBy: { type: Types.ObjectId, ref: 'Admin' },
    adminNotes: String, // ✅ Add this
    canLogin: { type: Boolean, default: true }
  }
})
approval?: {
  approvedAt: Date;
  approvedBy: Types.ObjectId;
  adminNotes?: string; // ✅ Add this
  canLogin: boolean;
};



}

export const AdminSchema = SchemaFactory.createForClass(Admin);

// Indexes
AdminSchema.index({ email: 1 });
AdminSchema.index({ adminId: 1 });
AdminSchema.index({ status: 1 });
AdminSchema.index({ roleId: 1 });
AdminSchema.index({ lastActivityAt: -1 });
