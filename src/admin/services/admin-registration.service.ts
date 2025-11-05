import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Registration, RegistrationDocument, RegistrationStatus, InterviewStatus } from '../../registration/schemas/registration.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { NotificationService } from '../../notifications/services/notification.service';
import { AdminActivityLogService } from './admin-activity-log.service';

@Injectable()
export class AdminRegistrationService {
  constructor(
    @InjectModel(Registration.name) private registrationModel: Model<RegistrationDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
    private activityLogService: AdminActivityLogService,
  ) {}

  /**
   * Get all registrations with filters
   */
  async getAllRegistrations(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; search?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.status = filters.status;
    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phoneNumber: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { ticketNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const [registrations, total] = await Promise.all([
      this.registrationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.registrationModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        registrations,
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
   * Get waitlist
   */
  async getWaitlist(page: number = 1, limit: number = 50): Promise<any> {
    const skip = (page - 1) * limit;

    const [registrations, total] = await Promise.all([
      this.registrationModel
        .find({ status: RegistrationStatus.WAITLIST })
        .sort({ 'waitlist.position': 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.registrationModel.countDocuments({ status: RegistrationStatus.WAITLIST })
    ]);

    return {
      success: true,
      data: {
        registrations,
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
   * Get registration details
   */
  async getRegistrationDetails(registrationId: string): Promise<any> {
    const registration = await this.registrationModel.findById(registrationId).lean();

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    return {
      success: true,
      data: registration
    };
  }

  /**
   * Shortlist candidate
   */
  async shortlistCandidate(registrationId: string, adminId: string, notes?: string): Promise<any> {
    const registration = await this.registrationModel.findById(registrationId);

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.status !== RegistrationStatus.WAITLIST) {
      throw new BadRequestException('Only waitlist candidates can be shortlisted');
    }

    registration.status = RegistrationStatus.INTERVIEW_ROUND_1;

    await registration.save();

    // Send notification (if you have phone/email notification system)
    // await this.notificationService.sendWhatsApp(registration.phoneNumber, 'You have been shortlisted!');

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'registration.shortlisted',
      module: 'registrations',
      targetId: registrationId,
      targetType: 'Registration',
      status: 'success',
      details: {
        candidateName: registration.name,
        ticketNumber: registration.ticketNumber,
        notes
      }
    });

    return {
      success: true,
      message: 'Candidate shortlisted successfully',
      data: registration
    };
  }

  /**
   * Complete interview round - FIX rejection type error
   */
  async completeInterviewRound(
    registrationId: string,
    round: number,
    adminId: string,
    data: {
      passed: boolean;
      rating?: number;
      notes?: string;
      callDuration?: number;
      callSessionId?: string;
    }
  ): Promise<any> {
    const registration = await this.registrationModel.findById(registrationId);

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (round < 1 || round > 4) {
      throw new BadRequestException('Invalid round number. Must be between 1 and 4.');
    }

    const roundKey = `round${round}` as 'round1' | 'round2' | 'round3' | 'round4';
    const interview = registration.interviews[roundKey];

    if (!interview) {
      throw new BadRequestException(`Interview round ${round} not found`);
    }

    // Update interview details
    interview.status = InterviewStatus.COMPLETED;
    interview.completedAt = new Date();
    interview.conductedBy = new Types.ObjectId(adminId);
    interview.notes = data.notes || '';
    interview.rating = data.rating || 0;

    if (round <= 3) {
      interview.passed = data.passed;
      if (data.callDuration) interview.callDuration = data.callDuration;
      if (data.callSessionId) interview.callSessionId = data.callSessionId;
    } else {
      interview.approved = data.passed;
    }

    // Move to next round or approve/reject
    if (data.passed) {
      if (round < 4) {
        registration.status = `interview_round_${round + 1}` as RegistrationStatus;
        
        await this.activityLogService.log({
          adminId,
          action: `interview.round${round}.passed`,
          module: 'registrations',
          targetId: registrationId,
          targetType: 'Registration',
          status: 'success',
          details: {
            candidateName: registration.name,
            round,
            rating: data.rating,
            notes: data.notes
          }
        });

        await registration.save();

        return {
          success: true,
          message: `Interview Round ${round} passed. Moving to Round ${round + 1}`,
          data: registration
        };
      } else {
        await this.approveAndCreateAstrologer(registration, adminId, data.notes);
        
        return {
          success: true,
          message: 'All interviews passed! Astrologer profile created successfully.',
          data: registration
        };
      }
    } else {
      // ✅ FIX: Add reapplyAfter field
      registration.status = RegistrationStatus.REJECTED;
      registration.rejection = {
        rejectedAt: new Date(),
        rejectedBy: new Types.ObjectId(adminId),
        reason: `Failed interview round ${round}. ${data.notes || ''}`,
        canReapply: false,
        reapplyAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // ✅ Always provide
      };

      await registration.save();

      await this.activityLogService.log({
        adminId,
        action: `interview.round${round}.failed`,
        module: 'registrations',
        targetId: registrationId,
        targetType: 'Registration',
        status: 'success',
        details: {
          candidateName: registration.name,
          round,
          reason: data.notes
        }
      });

      return {
        success: true,
        message: `Interview Round ${round} failed. Application rejected.`,
        data: registration
      };
    }
  }

  /**
   * ✅ FIX: Type casting for _id fields
   */
  private async approveAndCreateAstrologer(
    registration: RegistrationDocument,
    adminId: string,
    adminNotes?: string
  ): Promise<void> {
    try {
      const existingUser = await this.userModel.findOne({ 
        phoneNumber: registration.phoneNumber 
      });

      let userId: Types.ObjectId;

      if (existingUser) {
        userId = existingUser._id as Types.ObjectId;
        console.log(`✅ User already exists: ${userId}`);
      } else {
        // ✅ FIXED: Add all required fields
        const phoneHash = this.generatePhoneHash(registration.phoneNumber);
        const countryCode = this.extractCountryCode(registration.phoneNumber);

        const newUser = new this.userModel({
          // ✅ REQUIRED FIELDS (was missing these)
          phoneNumber: registration.phoneNumber,
          phoneHash: phoneHash,
          countryCode: countryCode,
          
          // Basic info
          name: registration.name,
          email: registration.email,
          gender: registration.gender,
          dateOfBirth: registration.dateOfBirth,
          profileImage: registration.profilePicture,
          
          // Account status
          status: 'active', // ✅ ADDED
          isPhoneVerified: true,
          appLanguage: 'en',
          registrationMethod: 'otp',
          
          // Wallet & Stats
          wallet: {
            balance: 0,
            totalRecharged: 0,
            totalSpent: 0,
            currency: 'INR',
          },
          stats: {
            totalSessions: 0,
            totalMinutesSpent: 0,
            totalAmount: 0,
            totalRatings: 0
          },
          
          // Collections
          orders: [],
          walletTransactions: [],
          remedies: [],
          reports: [],
          favoriteAstrologers: [],
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await newUser.save();
        userId = newUser._id as Types.ObjectId;
        console.log(`✅ New user created: ${userId}`);
      }

      // ✅ Create Astrologer Profile
      const astrologer = new this.astrologerModel({
        registrationId: registration._id as Types.ObjectId,
        userId: userId,
        name: registration.name,
        phoneNumber: registration.phoneNumber,
        email: registration.email,
        dateOfBirth: registration.dateOfBirth,
        gender: registration.gender,
        bio: registration.bio || '',
        profilePicture: registration.profilePicture,
        experienceYears: 0,
        specializations: registration.skills || [],
        languages: registration.languagesKnown || [],
        pricing: {
          chat: 0,
          call: 0,
          videoCall: 0
        },
        profileCompletion: {
          isComplete: false,
          steps: {
            basicInfo: true,
            expertise: true,
            pricing: false,
            gallery: false,
            introAudio: false,
            availability: false
          }
        },
        accountStatus: 'active',
        isChatEnabled: false,
        isCallEnabled: false,
        isLiveStreamEnabled: false,
        availability: {
          isOnline: false,
          isAvailable: false,
          isLive: false,
          workingHours: []
        }
      });

      await astrologer.save();
      console.log(`✅ Astrologer profile created: ${astrologer._id}`);

      // ✅ Update Registration Status
      registration.status = RegistrationStatus.APPROVED;
      registration.approval = {
        approvedAt: new Date(),
        approvedBy: new Types.ObjectId(adminId),
        adminNotes: adminNotes || '',
        astrologerId: astrologer._id as Types.ObjectId,
        canLogin: true
      };

      await registration.save();

      // ✅ Send Notification
      try {
        await this.notificationService.sendNotification({
          recipientId: (astrologer._id as Types.ObjectId).toString(),
          recipientModel: 'Astrologer',
          type: 'astrologer_approved',
          title: 'Application Approved! 🎉',
          message: 'Congratulations! You can now login to complete your profile and start earning.',
          priority: 'high'
        });
      } catch (notifyError) {
        console.warn('⚠️ Notification failed, but astrologer profile created successfully');
      }

      // ✅ Log Activity
      await this.activityLogService.log({
        adminId,
        action: 'registration.approved',
        module: 'registrations',
        targetId: (registration._id as Types.ObjectId).toString(),
        targetType: 'Registration',
        status: 'success',
        details: {
          candidateName: registration.name,
          ticketNumber: registration.ticketNumber,
          astrologerId: astrologer._id,
          userId: userId
        }
      });

      console.log(`✅ Registration approved. Astrologer can now login.`);

    } catch (error) {
      console.error('❌ Error creating astrologer profile:', error);
      throw new BadRequestException(`Failed to create astrologer profile: ${(error as any).message}`);
    }
  }

  /**
   * ✅ Helper: Generate phone hash
   */
  private generatePhoneHash(phoneNumber: string): string {
    return crypto
      .createHash('sha256')
      .update(phoneNumber)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * ✅ Helper: Extract country code from phone number
   */
  private extractCountryCode(phoneNumber: string): string {
    if (phoneNumber.startsWith('+91')) return '91';
    if (phoneNumber.startsWith('+1')) return '1';
    if (phoneNumber.startsWith('+')) {
      const match = phoneNumber.match(/^\+(\d{1,4})/);
      return match ? match[1] : '91';
    }
    return '91'; // Default fallback
  }

  /**
   * Reject registration - FIX optional reapplyAfter
   */
  async rejectRegistration(
    registrationId: string,
    adminId: string,
    reason: string,
    canReapply: boolean = false
  ): Promise<any> {
    const registration = await this.registrationModel.findById(registrationId);

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    registration.status = RegistrationStatus.REJECTED;
    registration.rejection = {
      rejectedAt: new Date(),
      rejectedBy: new Types.ObjectId(adminId),
      reason,
      canReapply,
      reapplyAfter: canReapply 
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) 
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // ✅ Always provide a date
    };

    await registration.save();

    await this.activityLogService.log({
      adminId,
      action: 'registration.rejected',
      module: 'registrations',
      targetId: registrationId,
      targetType: 'Registration',
      status: 'success',
      details: {
        candidateName: registration.name,
        reason,
        canReapply
      }
    });

    return {
      success: true,
      message: 'Registration rejected',
      data: registration
    };
  }

  /**
   * Get registration stats
   */
  async getRegistrationStats(): Promise<any> {
    const [
      total,
      waitlist,
      round1,
      round2,
      round3,
      round4,
      approved,
      rejected
    ] = await Promise.all([
      this.registrationModel.countDocuments(),
      this.registrationModel.countDocuments({ status: RegistrationStatus.WAITLIST }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.INTERVIEW_ROUND_1 }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.INTERVIEW_ROUND_2 }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.INTERVIEW_ROUND_3 }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.INTERVIEW_ROUND_4 }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.APPROVED }),
      this.registrationModel.countDocuments({ status: RegistrationStatus.REJECTED })
    ]);

    return {
      success: true,
      data: {
        total,
        waitlist,
        interviews: {
          round1,
          round2,
          round3,
          round4
        },
        approved,
        rejected
      }
    };
  }
}
