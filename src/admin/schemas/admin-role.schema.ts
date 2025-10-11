import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminRoleDocument = AdminRole & Document;

@Schema({ timestamps: true, collection: 'admin_roles' })
export class AdminRole {
  @Prop({ required: true, unique: true })
  roleId: string; // "ROLE_001"

  @Prop({ required: true, unique: true })
  name: string; // "Content Manager", "Support Agent"

  @Prop()
  description?: string;

  @Prop({ 
    type: [String],
    required: true,
    default: []
  })
  permissions: string[]; // Array of permission strings

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isSystem: boolean; // System roles can't be deleted

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const AdminRoleSchema = SchemaFactory.createForClass(AdminRole);

AdminRoleSchema.index({ name: 1 });
AdminRoleSchema.index({ isActive: 1 });
