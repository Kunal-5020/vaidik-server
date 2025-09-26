import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Astrologer, AstrologerDocument } from './schemas/astrologer.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateAstrologerDto } from './dto/create-astrologer.dto';
import { UpdateAstrologerDto } from './dto/update-astrologer.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { AstrologerSearchService } from './services/astrologer-search.service';
import { RatingReviewService } from './services/rating-review.service';

@Injectable()
export class AstrologersService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private astrologerSearchService: AstrologerSearchService,
    private ratingReviewService: RatingReviewService,
  ) {}

  // Create new astrologer profile
  async createAstrologer(userId: string, createAstrologerDto: CreateAstrologerDto): Promise<any> {
    // Check if user exists
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has an astrologer profile
    const existingAstrologer = await this.astrologerModel.findOne({ userId });
    if (existingAstrologer) {
      throw new ConflictException('User already has an astrologer profile');
    }

    // Validate specializations and languages
    const validSpecializations = [
      'Vedic Astrology', 'Numerology', 'Tarot Reading', 'Palmistry',
      'Vastu Shastra', 'Face Reading', 'KP Astrology', 'Lal Kitab',
      'Gemology', 'Marriage Compatibility', 'Career Astrology',
      'Health Astrology', 'Horary Astrology'
    ];

    const validLanguages = [
      'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi',
      'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'
    ];

    // Validate specializations
    const invalidSpecs = createAstrologerDto.specializations.filter(
      spec => !validSpecializations.includes(spec)
    );
    if (invalidSpecs.length > 0) {
      throw new BadRequestException(`Invalid specializations: ${invalidSpecs.join(', ')}`);
    }

    // Validate languages
    const invalidLangs = createAstrologerDto.languages.filter(
      lang => !validLanguages.includes(lang)
    );
    if (invalidLangs.length > 0) {
      throw new BadRequestException(`Invalid languages: ${invalidLangs.join(', ')}`);
    }

    try {
      // Create astrologer profile
      const newAstrologer = new this.astrologerModel({
        userId: user._id,
        name: createAstrologerDto.name,
        bio: createAstrologerDto.bio,
        experienceYears: createAstrologerDto.experienceYears,
        specializations: createAstrologerDto.specializations,
        languages: createAstrologerDto.languages,
        pricing: {
          chat: createAstrologerDto.chatPrice,
          call: createAstrologerDto.callPrice,
        },
        status: 'offline',
        verification: {
          isVerified: false,
          verificationStatus: 'pending',
          documents: []
        },
        stats: {
          totalOrders: 0,
          totalMinutes: 0,
          totalEarnings: 0,
          rating: 0,
          totalRatings: 0,
          responseTimeSeconds: 0,
          chatOrders: 0,
          callOrders: 0,
          repeatCustomers: 0
        },
        earnings: {
          totalEarned: 0,
          platformCommission: 20,
          withdrawableAmount: 0
        },
        accountStatus: 'pending',
        isChatEnabled: true,
        isCallEnabled: true,
        workingHours: [],
        recentOrders: []
      });

      await newAstrologer.save();

      console.log(`✅ Astrologer profile created for user: ${userId}`);

      return {
        success: true,
        message: 'Astrologer profile created successfully. Pending verification.',
        data: {
          astrologerId: newAstrologer._id,
          name: newAstrologer.name,
          specializations: newAstrologer.specializations,
          experienceYears: newAstrologer.experienceYears,
          pricing: newAstrologer.pricing,
          verificationStatus: newAstrologer.verification.verificationStatus,
          accountStatus: newAstrologer.accountStatus
        }
      };

    } catch (error) {
      console.error('❌ Error creating astrologer:', error);
      throw new BadRequestException('Failed to create astrologer profile');
    }
  }

  // Get astrologer profile by ID
  async getAstrologerById(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('userId', 'name profileImage phoneNumber createdAt')
      .exec();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        id: astrologer._id,
        name: astrologer.name,
        bio: astrologer.bio,
        experienceYears: astrologer.experienceYears,
        specializations: astrologer.specializations,
        languages: astrologer.languages,
        pricing: astrologer.pricing,
        status: astrologer.status,
        lastOnlineAt: astrologer.lastOnlineAt,
        rating: astrologer.stats.rating,
        totalRatings: astrologer.stats.totalRatings,
        totalOrders: astrologer.stats.totalOrders,
        responseTime: astrologer.stats.responseTimeSeconds,
        profilePicture: astrologer.profilePicture,
        verification: {
          isVerified: astrologer.verification.isVerified,
          verifiedAt: astrologer.verification.verifiedAt
        },
        services: {
          chatEnabled: astrologer.isChatEnabled,
          callEnabled: astrologer.isCallEnabled
        },
        user: astrologer.userId,
        createdAt: astrologer.createdAt,
        updatedAt: astrologer.updatedAt
      }
    };
  }

  // Update astrologer profile
  async updateAstrologer(astrologerId: string, updateDto: UpdateAstrologerDto): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    try {
      // Update fields
      Object.keys(updateDto).forEach(key => {
        if (updateDto[key] !== undefined) {
          if (key === 'chatPrice') {
            astrologer.pricing.chat = updateDto[key];
          } else if (key === 'callPrice') {
            astrologer.pricing.call = updateDto[key];
          } else {
            astrologer[key] = updateDto[key];
          }
        }
      });

      await astrologer.save();

      console.log(`✅ Astrologer profile updated: ${astrologerId}`);

      return {
        success: true,
        message: 'Astrologer profile updated successfully',
        data: {
          id: astrologer._id,
          name: astrologer.name,
          bio: astrologer.bio,
          experienceYears: astrologer.experienceYears,
          specializations: astrologer.specializations,
          languages: astrologer.languages,
          pricing: astrologer.pricing,
          services: {
            chatEnabled: astrologer.isChatEnabled,
            callEnabled: astrologer.isCallEnabled
          },
          updatedAt: astrologer.updatedAt
        }
      };

    } catch (error) {
      console.error('❌ Error updating astrologer:', error);
      throw new BadRequestException('Failed to update astrologer profile');
    }
  }

  // Update availability status and working hours
  async updateAvailability(astrologerId: string, updateDto: UpdateAvailabilityDto): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    try {
      // Update status
      if (updateDto.status) {
        astrologer.status = updateDto.status;
        if (updateDto.status === 'online') {
          astrologer.lastOnlineAt = new Date();
        }
      }

      // Update working hours
      if (updateDto.workingHours) {
        astrologer.workingHours = updateDto.workingHours.map(hw => ({
          ...hw,
          isAvailable: hw.isAvailable !== undefined ? hw.isAvailable : false
        }));
      }

      await astrologer.save();

      console.log(`✅ Astrologer availability updated: ${astrologerId} - ${updateDto.status}`);

      return {
        success: true,
        message: 'Availability updated successfully',
        data: {
          status: astrologer.status,
          lastOnlineAt: astrologer.lastOnlineAt,
          workingHours: astrologer.workingHours
        }
      };

    } catch (error) {
      console.error('❌ Error updating availability:', error);
      throw new BadRequestException('Failed to update availability');
    }
  }

  // Get astrologer's earnings and stats
  async getEarningsStats(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        earnings: astrologer.earnings,
        stats: astrologer.stats,
        recentOrders: astrologer.recentOrders.slice(0, 10), // Last 10 orders
        performance: {
          averageRating: astrologer.stats.rating,
          totalReviews: astrologer.stats.totalRatings,
          completionRate: astrologer.stats.totalOrders > 0 
            ? Math.round((astrologer.stats.totalOrders / (astrologer.stats.totalOrders + 0)) * 100) 
            : 0,
          responseTime: this.formatResponseTime(astrologer.stats.responseTimeSeconds)
        }
      }
    };
  }

  // Search astrologers (delegate to search service)
  async searchAstrologers(searchDto: any) {
    return this.astrologerSearchService.searchAstrologers(searchDto);
  }

  // Get featured astrologers
  async getFeaturedAstrologers(limit: number = 10) {
    const astrologers = await this.astrologerSearchService.getFeaturedAstrologers(limit);
    return {
      success: true,
      data: astrologers,
      count: astrologers.length
    };
  }

  // Get online astrologers
  async getOnlineAstrologers(limit: number = 20) {
    const astrologers = await this.astrologerSearchService.getOnlineAstrologers(limit);
    return {
      success: true,
      data: astrologers,
      count: astrologers.length
    };
  }

  // Get astrologers by specialization
  async getAstrologersBySpecialization(specialization: string, limit: number = 10) {
    const astrologers = await this.astrologerSearchService.getAstrologersBySpecialization(specialization, limit);
    return {
      success: true,
      data: astrologers,
      specialization,
      count: astrologers.length
    };
  }

  // Add review (delegate to rating service)
  async addReview(reviewData: any) {
    return this.ratingReviewService.addReview(reviewData);
  }

  // Get astrologer reviews
  async getReviews(astrologerId: string, page: number = 1, limit: number = 10) {
    const result = await this.ratingReviewService.getAstrologerReviews(astrologerId, page, limit);
    return {
      success: true,
      data: result
    };
  }

  // Get review stats
  async getReviewStats(astrologerId: string) {
    const stats = await this.ratingReviewService.getReviewStats(astrologerId);
    return {
      success: true,
      data: stats
    };
  }

  // Helper method to format response time
  private formatResponseTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)} minutes`;
    } else {
      return `${Math.round(seconds / 3600)} hours`;
    }
  }

  // Get all specializations (for frontend filters)
  async getSpecializations(): Promise<any> {
    return {
      success: true,
      data: [
        'Vedic Astrology', 'Numerology', 'Tarot Reading', 'Palmistry',
        'Vastu Shastra', 'Face Reading', 'KP Astrology', 'Lal Kitab',
        'Gemology', 'Marriage Compatibility', 'Career Astrology',
        'Health Astrology', 'Horary Astrology'
      ]
    };
  }

  // Get all languages (for frontend filters)
  async getLanguages(): Promise<any> {
    return {
      success: true,
      data: [
        'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi',
        'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'
      ]
    };
  }
}
