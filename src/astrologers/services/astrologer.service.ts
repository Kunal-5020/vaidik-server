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
   * Get astrologer profile (requires auth)
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
          gallery: { completed: steps.gallery, label: 'Photo Gallery' },
          introAudio: { completed: steps.introAudio, label: 'Intro Audio Message' },
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
   * Update gallery photos
   */
  async updateGallery(astrologerId: string, photos: any[]): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.gallery.photos = photos.map((photo, index) => ({
      url: photo.url,
      key: photo.key,
      uploadedAt: new Date(),
      order: photo.order !== undefined ? photo.order : index,
      isApproved: false // Admin will approve
    }));
    astrologer.profileCompletion.steps.gallery = photos.length > 0;

    await this.checkAndUpdateProfileCompletion(astrologer);
    await astrologer.save();

    return {
      success: true,
      message: 'Gallery updated successfully. Photos pending admin approval.',
      data: {
        gallery: astrologer.gallery,
        profileCompletion: astrologer.profileCompletion
      }
    };
  }

  /**
   * Update intro audio
   */
  async updateIntroAudio(astrologerId: string, audioData: any): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.introAudio = {
      url: audioData.url,
      key: audioData.key,
      duration: audioData.duration,
      uploadedAt: new Date(),
      isApproved: false // Admin will approve
    };
    astrologer.profileCompletion.steps.introAudio = true;

    await this.checkAndUpdateProfileCompletion(astrologer);
    await astrologer.save();

    return {
      success: true,
      message: 'Intro audio updated successfully. Pending admin approval.',
      data: {
        introAudio: astrologer.introAudio,
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
  const missing: string[] = []; // ✅ Fixed: Explicit type
  if (!steps.basicInfo) missing.push('Basic Information');
  if (!steps.expertise) missing.push('Expertise & Languages');
  if (!steps.pricing) missing.push('Pricing Setup');
  if (!steps.gallery) missing.push('Photo Gallery');
  if (!steps.introAudio) missing.push('Intro Audio Message');
  if (!steps.availability) missing.push('Availability & Working Hours');
  return missing;
}


}
