import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument, AstrologerOnboardingStatus } from '../schemas/astrologer.schema';
import { RegisterAstrologerDto } from '../dto/register-astrologer.dto';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // Register new astrologer (adds to waitlist)
  async registerAstrologer(registerDto: RegisterAstrologerDto): Promise<any> {
    // Check if already registered
    const existing = await this.astrologerModel.findOne({
      $or: [
        { phoneNumber: registerDto.phoneNumber },
        { email: registerDto.email }
      ]
    });

    if (existing) {
      throw new BadRequestException('Phone number or email already registered');
    }

    // Generate ticket number
    const ticketNumber = `AST-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Get current waitlist position
    const waitlistCount = await this.astrologerModel.countDocuments({
      'onboarding.status': AstrologerOnboardingStatus.WAITLIST
    });

    const astrologer = new this.astrologerModel({
      userId: registerDto.userId,
      name: registerDto.name,
      phoneNumber: registerDto.phoneNumber,
      email: registerDto.email,
      dateOfBirth: new Date(registerDto.dateOfBirth),
      gender: registerDto.gender,
      bio: registerDto.bio || '',
      profilePicture: registerDto.profilePicture,
      experienceYears: 0, // Will be set during interview
      specializations: registerDto.skills, // Use skills as specializations
      languages: registerDto.languagesKnown,
      pricing: {
        chat: 0, // Will be set during profile creation
        call: 0,
        videoCall: 0
      },
      onboarding: {
        status: AstrologerOnboardingStatus.WAITLIST,
        ticketNumber,
        waitlist: {
          joinedAt: new Date(),
          position: waitlistCount + 1,
          estimatedWaitTime: '2-3 weeks'
        },
        interviews: {
          round1: { status: 'pending', type: 'profile_review' },
          round2: { status: 'pending', type: 'audio_call' },
          round3: { status: 'pending', type: 'video_call' },
          round4: { status: 'pending', type: 'final_verification' }
        }
      },
      accountStatus: 'active',
      isChatEnabled: false, // Disabled until approved
      isCallEnabled: false
    });

    await astrologer.save();

    return {
      success: true,
      message: 'Registration successful! You are now in the waitlist.',
      data: {
        ticketNumber,
        waitlistPosition: waitlistCount + 1,
        estimatedWaitTime: '2-3 weeks',
        status: AstrologerOnboardingStatus.WAITLIST
      }
    };
  }

  // Get onboarding status
  async getOnboardingStatus(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('onboarding name phoneNumber')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        name: astrologer.name,
        phoneNumber: astrologer.phoneNumber,
        ticketNumber: astrologer.onboarding.ticketNumber,
        status: astrologer.onboarding.status,
        waitlist: astrologer.onboarding.waitlist,
        shortlist: astrologer.onboarding.shortlist,
        interviews: astrologer.onboarding.interviews,
        approval: astrologer.onboarding.approval
      }
    };
  }

  // Check if can proceed to next interview round
  canProceedToNextRound(astrologer: AstrologerDocument): boolean {
    const interviews = astrologer.onboarding.interviews;

    if (interviews.round1.status !== 'completed') return false;
    if (interviews.round2.status !== 'completed') return false;
    if (interviews.round3.status !== 'completed') return false;
    if (interviews.round4.status !== 'completed') return false;

    return true;
  }
}
