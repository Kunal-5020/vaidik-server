import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ProfileChangeRequestDocument = ProfileChangeRequest & Document;

@Schema({ timestamps: true })
export class ProfileChangeRequest {
  @Prop({ type: Types.ObjectId, ref: 'Astrologer', required: true })
  astrologerId: Types.ObjectId;

  @Prop({ required: true, enum: ['major', 'minor'] })
  requestType: string;

  @Prop({
    type: [{
      field: { type: String, required: true },
      currentValue: MongooseSchema.Types.Mixed,
      requestedValue: MongooseSchema.Types.Mixed,
      reason: String
    }],
    required: true
  })
  changes: {
    field: string;
    currentValue: any;
    requestedValue: any;
    reason?: string;
  }[];

  @Prop({ required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop({ required: true, default: Date.now })
  submittedAt: Date;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  adminNotes?: string;
}

export const ProfileChangeRequestSchema = SchemaFactory.createForClass(ProfileChangeRequest);

// Indexes
ProfileChangeRequestSchema.index({ astrologerId: 1, status: 1 });
ProfileChangeRequestSchema.index({ status: 1, submittedAt: -1 });
ProfileChangeRequestSchema.index({ createdAt: -1 });

// Static method to check if change is major or minor
ProfileChangeRequestSchema.statics.isMajorChange = function(field: string): boolean {
  const majorFields = [
    'name',
    'phoneNumber',
    'email',
    'specializations',
    'experienceYears',
    'languages'
  ];
  return majorFields.includes(field);
};
