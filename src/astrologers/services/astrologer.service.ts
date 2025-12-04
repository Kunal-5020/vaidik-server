import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';

@Injectable()
export class AstrologerService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  /**
   * ✅ NEW: Get complete profile with ALL details
   */
  async getCompleteProfile(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId', 'ticketNumber status')
      .select('-__v -devices.fcmToken') // Exclude sensitive data
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer profile not found');
    }

    // Calculate profile completion percentage
    const steps = astrologer.profileCompletion.steps;
    const completedSteps = Object.values(steps).filter(step => step === true).length;
    const totalSteps = Object.keys(steps).length;
    const completionPercentage = Math.round((completedSteps / totalSteps) * 100);

    return {
      success: true,
      data: {
        // Personal Information
        _id: astrologer._id,
        name: astrologer.name,
        email: astrologer.email,
        phoneNumber: astrologer.phoneNumber,
        dateOfBirth: astrologer.dateOfBirth,
        gender: astrologer.gender,
        profilePicture: astrologer.profilePicture,
        bio: astrologer.bio,

        // Professional Details
        experienceYears: astrologer.experienceYears,
        specializations: astrologer.specializations,
        languages: astrologer.languages,
        tier: astrologer.tier,

        // Pricing
        pricing: astrologer.pricing,

        // Availability
        availability: {
          isOnline: astrologer.availability.isOnline,
          isAvailable: astrologer.availability.isAvailable,
          isLive: astrologer.availability.isLive,
          workingHours: astrologer.availability.workingHours,
          lastActive: astrologer.availability.lastActive,
        },

        // Services Status
        isChatEnabled: astrologer.isChatEnabled,
        isCallEnabled: astrologer.isCallEnabled,
        isLiveStreamEnabled: astrologer.isLiveStreamEnabled,

        // Account Status
        accountStatus: astrologer.accountStatus,
        singleDeviceMode: astrologer.singleDeviceMode,

        // Profile Completion
        profileCompletion: {
          isComplete: astrologer.profileCompletion.isComplete,
          completedAt: astrologer.profileCompletion.completedAt,
          percentage: completionPercentage,
          completedSteps,
          totalSteps,
          steps: astrologer.profileCompletion.steps,
        },

        // Stats & Ratings
        ratings: astrologer.ratings,
        stats: astrologer.stats,
        earnings: astrologer.earnings,

        // Registration Info
        registrationId: astrologer.registrationId,

        // Timestamps
        createdAt: astrologer.createdAt,
        updatedAt: astrologer.updatedAt,
      },
    };
  }

  /**
   * Get astrologer profile (basic - kept for backward compatibility)
   */
  async getProfile(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId', 'ticketNumber status')
      .select('-__v')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer profile not found');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  /**
   * Get profile completion status
   */
  async getProfileCompletionStatus(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('profileCompletion')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const steps = astrologer.profileCompletion.steps;
    const completedSteps = Object.values(steps).filter(step => step === true).length;
    const totalSteps = Object.keys(steps).length;
    const percentage = Math.round((completedSteps / totalSteps) * 100);

    return {
      success: true,
      data: {
        isComplete: astrologer.profileCompletion.isComplete,
        completedAt: astrologer.profileCompletion.completedAt,
        percentage,
        completedSteps,
        totalSteps,
        steps: {
          basicInfo: { completed: steps.basicInfo, label: 'Basic Information' },
          expertise: { completed: steps.expertise, label: 'Expertise & Languages' },
          pricing: { completed: steps.pricing, label: 'Pricing Setup' },
          availability: { completed: steps.availability, label: 'Availability & Working Hours' }
        }
      }
    };
  }

  /**
   * Update pricing (part of profile completion)
   */
  async updatePricing(astrologerId: string, pricing: any): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.pricing = {
      chat: pricing.chat,
      call: pricing.call,
      videoCall: pricing.videoCall || 0
    };
    astrologer.profileCompletion.steps.pricing = true;

    await this.checkAndUpdateProfileCompletion(astrologer);
    await astrologer.save();

    return {
      success: true,
      message: 'Pricing updated successfully',
      data: {
        pricing: astrologer.pricing,
        profileCompletion: astrologer.profileCompletion
      }
    };
  }

  /**
   * Update availability/working hours
   */
  async updateAvailability(astrologerId: string, availabilityData: any): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.availability.workingHours = availabilityData.workingHours;
    astrologer.profileCompletion.steps.availability = availabilityData.workingHours.length > 0;

    await this.checkAndUpdateProfileCompletion(astrologer);
    await astrologer.save();

    return {
      success: true,
      message: 'Availability updated successfully',
      data: {
        availability: astrologer.availability,
        profileCompletion: astrologer.profileCompletion
      }
    };
  }

  /**
   * Toggle online status
   */
  async toggleOnlineStatus(astrologerId: string, isOnline: boolean): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.availability.isOnline = isOnline;
    astrologer.availability.lastActive = new Date();

    // If going offline, also set isAvailable to false
    if (!isOnline) {
      astrologer.availability.isAvailable = false;
    }

    await astrologer.save();

    return {
      success: true,
      message: `You are now ${isOnline ? 'online' : 'offline'}`,
      data: {
        isOnline: astrologer.availability.isOnline,
        isAvailable: astrologer.availability.isAvailable,
        lastActive: astrologer.availability.lastActive
      }
    };
  }

  /**
   * Toggle availability (for receiving orders)
   */
  async toggleAvailability(astrologerId: string, isAvailable: boolean): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Can only be available if online
    if (isAvailable && !astrologer.availability.isOnline) {
      throw new BadRequestException('You must be online to mark yourself as available');
    }

    astrologer.availability.isAvailable = isAvailable;
    astrologer.availability.lastActive = new Date();

    await astrologer.save();

    return {
      success: true,
      message: `You are now ${isAvailable ? 'available' : 'unavailable'} for orders`,
      data: {
        isOnline: astrologer.availability.isOnline,
        isAvailable: astrologer.availability.isAvailable,
        lastActive: astrologer.availability.lastActive
      }
    };
  }

  /**
   * Start live streaming
   */
  async startLiveStream(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Check if profile is complete
    if (!astrologer.profileCompletion.isComplete) {
      throw new ForbiddenException({
        message: 'Please complete your profile before starting live stream',
        missingSteps: this.getMissingProfileSteps(astrologer.profileCompletion.steps)
      });
    }

    // Check if live streaming is enabled
    if (!astrologer.isLiveStreamEnabled) {
      throw new ForbiddenException('Live streaming is disabled. Contact support.');
    }

    // Check if already live
    if (astrologer.availability.isLive) {
      throw new BadRequestException({
        message: 'You are already live',
        liveStreamId: astrologer.availability.liveStreamId
      });
    }

    // Generate live stream session ID
    const liveStreamId = `live_${astrologerId}_${Date.now()}`;

    astrologer.availability.isLive = true;
    astrologer.availability.liveStreamId = liveStreamId;
    astrologer.availability.isOnline = true;
    astrologer.availability.isAvailable = true;
    astrologer.availability.lastActive = new Date();

    await astrologer.save();

    return {
      success: true,
      message: 'Live stream started successfully',
      data: {
        liveStreamId,
        astrologerId,
        astrologerName: astrologer.name,
        profilePicture: astrologer.profilePicture,
        specializations: astrologer.specializations,
        isLive: true,
        startedAt: new Date()
      }
    };
  }

  /**
   * Stop live streaming
   */
  async stopLiveStream(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (!astrologer.availability.isLive) {
      throw new BadRequestException('You are not currently live');
    }

    const previousStreamId = astrologer.availability.liveStreamId;

    astrologer.availability.isLive = false;
    astrologer.availability.liveStreamId = undefined;
    astrologer.availability.lastActive = new Date();

    await astrologer.save();

    return {
      success: true,
      message: 'Live stream stopped successfully',
      data: {
        liveStreamId: previousStreamId,
        stoppedAt: new Date()
      }
    };
  }

  /**
   * Get live stream status
   */
  async getLiveStreamStatus(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('availability.isLive availability.liveStreamId name profilePicture specializations')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        isLive: astrologer.availability.isLive,
        liveStreamId: astrologer.availability.liveStreamId,
        astrologerName: astrologer.name,
        profilePicture: astrologer.profilePicture,
        specializations: astrologer.specializations
      }
    };
  }

  /**
   * Helper: Check and update profile completion status
   */
  private async checkAndUpdateProfileCompletion(astrologer: AstrologerDocument): Promise<void> {
    const steps = astrologer.profileCompletion.steps;
    const allStepsComplete = Object.values(steps).every(step => step === true);

    if (allStepsComplete && !astrologer.profileCompletion.isComplete) {
      astrologer.profileCompletion.isComplete = true;
      astrologer.profileCompletion.completedAt = new Date();
      
      // Enable services once profile is complete
      astrologer.isChatEnabled = true;
      astrologer.isCallEnabled = true;
      astrologer.isLiveStreamEnabled = true;
    }
  }

  /**
   * Helper: Get missing profile steps
   */
  private getMissingProfileSteps(steps: any): string[] {
    const missing: string[] = [];
    if (!steps.basicInfo) missing.push('Basic Information');
    if (!steps.expertise) missing.push('Expertise & Languages');
    if (!steps.pricing) missing.push('Pricing Setup');
    if (!steps.availability) missing.push('Availability & Working Hours');
    return missing;
  }
}
