// src/admin/schemas/admin.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AdminRole, AdminPermission } from '../enums/admin-role.enum';

export type AdminDocument = Admin & Document;

@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: AdminRole, required: true })
  role: AdminRole;

  @Prop({ type: [String], enum: AdminPermission, default: [] })
  permissions: AdminPermission[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;

  @Prop()
  profileImage: string;

  @Prop()
  phone: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

// Index for performance
AdminSchema.index({ email: 1 });
AdminSchema.index({ role: 1 });
