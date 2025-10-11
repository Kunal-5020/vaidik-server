import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument, AstrologerOnboardingStatus } from '../schemas/astrologer.schema';
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';

@Injectable()
export class AstrologersService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // ===== PUBLIC METHODS (For Users) =====

  // Get all approved astrologers (public listing)
  async getApprovedAstrologers(
    page: number = 1,
    limit: number = 20,
    filters?: {
      specializations?: string[];
      languages?: string[];
      minRating?: number;
      isOnline?: boolean;
      sortBy?: 'rating' | 'experience' | 'price';
    }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {
      'onboarding.status': AstrologerOnboardingStatus.APPROVED,
      accountStatus: 'active'
    };

    // Apply filters
    if (filters?.specializations?.length) {
      query.specializations = { $in: filters.specializations };
    }

    if (filters?.languages?.length) {
      query.languages = { $in: filters.languages };
    }

    if (filters?.minRating) {
      query['ratings.average'] = { $gte: filters.minRating };
    }

    if (filters?.isOnline !== undefined) {
      query['availability.isOnline'] = filters.isOnline;
      query['availability.isAvailable'] = true;
    }

    // Sorting
    let sort: any = { 'ratings.average': -1 }; // Default: by rating
    if (filters?.sortBy === 'experience') {
      sort = { experienceYears: -1 };
    } else if (filters?.sortBy === 'price') {
      sort = { 'pricing.call': 1 };
    }

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find(query)
        .select('name bio profilePicture gallery introAudio experienceYears specializations languages ratings pricing availability')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        astrologers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // Get single astrologer details (public)
  async getAstrologerDetails(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findOne({
        _id: astrologerId,
        'onboarding.status': AstrologerOnboardingStatus.APPROVED,
        accountStatus: 'active'
      })
      .select('-onboarding -phoneHash')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found or not available');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  // ===== ASTROLOGER PROFILE MANAGEMENT =====

  // Get own profile (astrologer viewing their own profile)
  async getOwnProfile(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('-phoneHash')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  // Update profile (minor changes only, major changes need request)
  async updateProfile(
    astrologerId: string,
    updateDto: UpdateAstrologerProfileDto
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Only allow approved astrologers to update
    if (astrologer.onboarding.status !== AstrologerOnboardingStatus.APPROVED) {
      throw new BadRequestException('Only approved astrologers can update their profile');
    }

    const updateFields: any = {};

    // Minor changes (allowed directly)
    if (updateDto.bio !== undefined) updateFields.bio = updateDto.bio;
    if (updateDto.profilePicture !== undefined) updateFields.profilePicture = updateDto.profilePicture;

    // Pricing updates
    if (updateDto.chatRate !== undefined) updateFields['pricing.chat'] = updateDto.chatRate;
    if (updateDto.callRate !== undefined) updateFields['pricing.call'] = updateDto.callRate;
    if (updateDto.videoCallRate !== undefined) updateFields['pricing.videoCall'] = updateDto.videoCallRate;

    // Availability toggles
    if (updateDto.isChatEnabled !== undefined) updateFields.isChatEnabled = updateDto.isChatEnabled;
    if (updateDto.isCallEnabled !== undefined) updateFields.isCallEnabled = updateDto.isCallEnabled;

    updateFields.updatedAt = new Date();

    const updatedAstrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: updateFields },
      { new: true }
    ).select('-phoneHash');

    if (!updatedAstrologer) {
      throw new NotFoundException('Astrologer not found after update');
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedAstrologer
    };
  }

  // ===== GALLERY MANAGEMENT =====

  // Add photo to gallery
  async addGalleryPhoto(
    astrologerId: string,
    photoUrl: string,
    s3Key: string
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Check max photos limit
    if (astrologer.gallery.photos.length >= astrologer.gallery.maxPhotos) {
      throw new BadRequestException(`Maximum ${astrologer.gallery.maxPhotos} photos allowed`);
    }

    astrologer.gallery.photos.push({
      url: photoUrl,
      key: s3Key,
      uploadedAt: new Date(),
      order: astrologer.gallery.photos.length,
      isApproved: false // Needs admin approval
    });

    await astrologer.save();

    return {
      success: true,
      message: 'Photo added to gallery (pending approval)',
      data: {
        photoCount: astrologer.gallery.photos.length,
        maxPhotos: astrologer.gallery.maxPhotos
      }
    };
  }

  // Remove photo from gallery
  async removeGalleryPhoto(astrologerId: string, s3Key: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.gallery.photos = astrologer.gallery.photos.filter(
      photo => photo.key !== s3Key
    );

    await astrologer.save();

    return {
      success: true,
      message: 'Photo removed from gallery'
    };
  }

  // ===== INTRO AUDIO MANAGEMENT =====

  // Upload intro audio
  async uploadIntroAudio(
    astrologerId: string,
    audioUrl: string,
    s3Key: string,
    duration: number
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.introAudio = {
      url: audioUrl,
      key: s3Key,
      duration,
      uploadedAt: new Date(),
      isApproved: false // Needs admin approval
    };

    await astrologer.save();

    return {
      success: true,
      message: 'Intro audio uploaded (pending approval)',
      data: astrologer.introAudio
    };
  }

  // Delete intro audio
  async deleteIntroAudio(astrologerId: string): Promise<any> {
    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $unset: { introAudio: '' }
    });

    return {
      success: true,
      message: 'Intro audio deleted'
    };
  }

  // ===== INTERNAL METHODS =====

  // Get astrologer by user ID
  async getAstrologerByUserId(userId: string): Promise<AstrologerDocument | null> {
    return this.astrologerModel.findOne({ userId }).exec();
  }

  // Check if astrologer is approved and can login
  async canLogin(astrologerId: string): Promise<boolean> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('onboarding.status onboarding.approval.canLogin accountStatus')
      .lean();

    if (!astrologer) return false;

    return (
      astrologer.onboarding.status === AstrologerOnboardingStatus.APPROVED &&
      astrologer.onboarding.approval?.canLogin === true &&
      astrologer.accountStatus === 'active'
    );
  }
}
