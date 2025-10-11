import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProfileChangeRequest, ProfileChangeRequestDocument } from '../schemas/profile-change-request.schema';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { RequestProfileChangeDto } from '../dto/request-profile-change.dto';

@Injectable()
export class ProfileChangeService {
  private readonly majorFields = [
    'name',
    'phoneNumber',
    'email',
    'dateOfBirth',
    'gender',
    'skills',
    'languagesKnown',
    'experienceYears'
  ];

  private readonly minorFields = [
    'bio',
    'profilePicture',
    'pricing.chat',
    'pricing.call',
    'pricing.videoCall',
    'isChatEnabled',
    'isCallEnabled'
  ];

  constructor(
    @InjectModel(ProfileChangeRequest.name) 
    private changeRequestModel: Model<ProfileChangeRequestDocument>,
    @InjectModel(Astrologer.name) 
    private astrologerModel: Model<AstrologerDocument>,
  ) {}

  async requestChange(astrologerId: string, requestDto: RequestProfileChangeDto): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const hasMajorChanges = requestDto.changes.some(change => 
      this.majorFields.includes(change.field)
    );

    const requestType = hasMajorChanges ? 'major' : 'minor';

    if (requestType === 'minor') {
      for (const change of requestDto.changes) {
        await this.applyChange(astrologerId, change);
      }

      return {
        success: true,
        message: 'Minor changes applied successfully',
        autoApproved: true
      };
    }

    const changeRequest = new this.changeRequestModel({
      astrologerId,
      requestType,
      changes: requestDto.changes,
      status: 'pending',
      submittedAt: new Date()
    });

    await changeRequest.save();

    return {
      success: true,
      message: 'Change request submitted. Awaiting admin approval.',
      data: {
        requestId: changeRequest._id,
        requestType,
        status: 'pending'
      }
    };
  }

  async getMyChangeRequests(astrologerId: string): Promise<any> {
    const requests = await this.changeRequestModel
      .find({ astrologerId })
      .sort({ submittedAt: -1 })
      .lean();

    return {
      success: true,
      data: requests
    };
  }

  private async applyChange(astrologerId: string, change: any): Promise<void> {
    const updateField: any = {};
    updateField[change.field] = change.requestedValue;

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $set: updateField
    });
  }

  isMajorChange(field: string): boolean {
    return this.majorFields.includes(field);
  }
}
