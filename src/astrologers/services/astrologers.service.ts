import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';

@Injectable()
export class AstrologersService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // ===== PUBLIC METHODS (For Users) =====

  /**
   * Get all approved astrologers (public listing)
   */
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
      accountStatus: 'active',
      'profileCompletion.isComplete': true
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
    let sort: any = { 'ratings.average': -1 };
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

  /**
   * Get single astrologer details (public)
   */
  async getAstrologerDetails(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findOne({
        _id: astrologerId,
        accountStatus: 'active',
        'profileCompletion.isComplete': true
      })
      .select('-phoneNumber -email')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found or not available');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  /**
   * Get all live astrologers (for users to watch)
   */
  async getLiveAstrologers(): Promise<any> {
    const liveAstrologers = await this.astrologerModel
      .find({
        'availability.isLive': true,
        accountStatus: 'active',
        'profileCompletion.isComplete': true
      })
      .select('name profilePicture specializations ratings availability.liveStreamId')
      .sort({ 'ratings.average': -1 })
      .lean();

    return {
      success: true,
      count: liveAstrologers.length,
      data: liveAstrologers
    };
  }

  // ===== ASTROLOGER PROFILE MANAGEMENT =====

  /**
   * Get own profile (astrologer viewing their own profile)
   */
  async getOwnProfile(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId', 'ticketNumber status')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  /**
   * Update profile (minor changes allowed directly)
   */
  async updateProfile(
    astrologerId: string,
    updateDto: UpdateAstrologerProfileDto
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (astrologer.accountStatus !== 'active') {
      throw new BadRequestException('Your account is not active. Contact support.');
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
    );

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

  /**
   * Add photo to gallery
   */
  async addGalleryPhoto(
    astrologerId: string,
    photoUrl: string,
    s3Key: string
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (astrologer.gallery.photos.length >= astrologer.gallery.maxPhotos) {
      throw new BadRequestException(`Maximum ${astrologer.gallery.maxPhotos} photos allowed`);
    }

    astrologer.gallery.photos.push({
      url: photoUrl,
      key: s3Key,
      uploadedAt: new Date(),
      order: astrologer.gallery.photos.length,
      isApproved: false
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

  /**
   * Remove photo from gallery
   */
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

  /**
   * Upload intro audio
   */
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
      isApproved: false
    };

    await astrologer.save();

    return {
      success: true,
      message: 'Intro audio uploaded (pending approval)',
      data: astrologer.introAudio
    };
  }

  /**
   * Delete intro audio
   */
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

  /**
   * Get astrologer by user ID
   */
  async getAstrologerByUserId(userId: string): Promise<AstrologerDocument | null> {
    return this.astrologerModel.findOne({ userId }).exec();
  }

  /**
   * Check if astrologer can login (account active)
   */
  async canLogin(astrologerId: string): Promise<boolean> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('accountStatus')
      .lean();

    if (!astrologer) return false;

    return astrologer.accountStatus === 'active';
  }
}
