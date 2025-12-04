// src/bank-accounts/schemas/bank-account.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BankAccountDocument = BankAccount & Document;

@Schema({ timestamps: true })
export class BankAccount {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Astrologer' })
  astrologerId: Types.ObjectId;

  @Prop({ required: true })
  accountHolderName: string;

  @Prop({ required: true }) // We'll encrypt this
  accountNumber: string;

  @Prop({ required: true, uppercase: true })
  ifscCode: string;

  @Prop()
  bankName?: string;

  @Prop()
  branchName?: string;

  @Prop()
  upiId?: string;

  @Prop({ default: false })
  isPrimary: boolean;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: 'pending' }) // 'pending', 'verified', 'rejected'
  verificationStatus: string;

  @Prop()
  verificationNote?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

// Indexes
BankAccountSchema.index({ astrologerId: 1 });
BankAccountSchema.index({ isPrimary: 1, astrologerId: 1 });
