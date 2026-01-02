import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RechargePackDocument = RechargePack & Document;

@Schema({ timestamps: true })
export class RechargePack {
  @Prop({ required: true, unique: true, index: true })
  amount: number; // e.g., 50, 100, 500

  @Prop({ required: true, default: 0 })
  bonusPercentage: number; // e.g., 100, 10, 20

  @Prop({ default: false })
  isPopular: boolean; // To tag "Most Popular" in app

  @Prop({ default: true })
  isActive: boolean;
}

export const RechargePackSchema = SchemaFactory.createForClass(RechargePack);