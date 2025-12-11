import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ConflictException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Registration, RegistrationDocument, RegistrationStatus } from '../schemas/registration.schema';
import { RegisterDto } from '../dto/register.dto';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { OtpService } from '../../auth/services/otp/otp.service';

// Add this interface after imports
interface TimelineEvent {
  event: string;
  date: Date;
  status: string;
  details?: string;
  passed?: boolean;
  approved?: boolean;
  reason?: string;
}


@Injectable()
export class RegistrationService {
  constructor(
    @InjectModel(Registration.name) private registrationModel: Model<RegistrationDocument>,
    private otpService: OtpService // Inject OTP service
  ) {}

  // ========== OTP METHODS (NEW) ==========

  /**
   * Send OTP to phone number (NO database record created)
   */
  async sendOTP(sendOtpDto: SendOtpDto): Promise<any> {
    const { phoneNumber, countryCode } = sendOtpDto;

    try {
      // Send OTP via OtpService
      const result = await this.otpService.sendOTP(phoneNumber, countryCode);

      return {
        success: true,
        message: result.message,
        data: {
          phoneNumber,
          countryCode: `+${countryCode}`,
          ...(result.otp && { otp: result.otp }) // Include OTP in dev mode
        }
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to send OTP');
    }
  }

 /**
 * Verify OTP (and check if phone is already registered)
 */
async verifyOTP(verifyOtpDto: VerifyOtpDto): Promise<any> {
  const { phoneNumber, countryCode, otp } = verifyOtpDto;

  try {
    // Step 1: Verify OTP via OtpService
    const isValid = await this.otpService.verifyOTP(phoneNumber, countryCode, otp);

    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Step 2: Check if phone number is already registered
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;
    const existingRegistration = await this.registrationModel
      .findOne({ phoneNumber: fullPhoneNumber })
      .select('ticketNumber name email status waitlist interviews approval rejection createdAt')
      .lean();

    // Step 3: If already registered, return their status
    if (existingRegistration) {
      return {
        success: true,
        message: 'OTP verified successfully',
        data: {
          isValid: true,
          isNewUser: false, // ✅ CHANGED: was 'verified'
          existingRegistration: {
            ticketNumber: existingRegistration.ticketNumber,
            name: existingRegistration.name,
            email: existingRegistration.email,
            status: existingRegistration.status,
            statusMessage: this.getStatusMessage(existingRegistration.status),
            registeredAt: existingRegistration.createdAt,
            currentStep: this.getCurrentStepInfo(existingRegistration),
            // Include detailed info based on status
            ...(existingRegistration.status === RegistrationStatus.WAITLIST && {
              waitlist: existingRegistration.waitlist
            }),
            ...(existingRegistration.status === RegistrationStatus.APPROVED && {
              approval: existingRegistration.approval
            }),
            ...(existingRegistration.status === RegistrationStatus.REJECTED && {
              rejection: existingRegistration.rejection
            })
          }
        }
      };
    }

    // Step 4: New user - allow registration
    return {
      success: true,
      message: 'OTP verified successfully. Please complete your registration.',
      data: {
        isValid: true, // ✅ CHANGED: was 'verified'
        isNewUser: true,
        existingRegistration: null // ✅ ADDED: frontend expects this field
      }
    };

  } catch (error) {
    throw new BadRequestException(error.message || 'OTP verification failed');
  }
}

/**
 * Helper: Get user-friendly status message
 */
private getStatusMessage(status: RegistrationStatus): string {
  const messages = {
    [RegistrationStatus.WAITLIST]: 'Your application is in the waitlist. We will contact you soon.',
    [RegistrationStatus.SHORTLISTED]: 'Congratulations! You have been shortlisted for interviews.',
    [RegistrationStatus.INTERVIEW_ROUND_1]: 'Interview Round 1 - Profile Review',
    [RegistrationStatus.INTERVIEW_ROUND_2]: 'Interview Round 2 - Audio Call',
    [RegistrationStatus.INTERVIEW_ROUND_3]: 'Interview Round 3 - Video Call',
    [RegistrationStatus.INTERVIEW_ROUND_4]: 'Interview Round 4 - Final Verification',
    [RegistrationStatus.APPROVED]: '✅ Congratulations! Your application has been approved. You can now login to the Astrologer app.',
    [RegistrationStatus.REJECTED]: '❌ Your application was not approved. Please contact support for more information.'
  };

  return messages[status] || 'Status unknown';
}


  // ========== REGISTRATION METHOD (UPDATED) ==========

  /**
   * Register new astrologer candidate
   * This is a public endpoint - no authentication required
   */
  async register(registerDto: RegisterDto): Promise<any> {
    const { phoneNumber, countryCode, email } = registerDto;

    // Construct full phone number for storage
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;

    // Check if already registered
    const existingRegistration = await this.registrationModel.findOne({
      $or: [
        { phoneNumber: fullPhoneNumber },
        { email }
      ]
    });

    if (existingRegistration) {
      // If already registered, return their current status
      if (existingRegistration.status === RegistrationStatus.REJECTED) {
        throw new BadRequestException({
          message: 'Your application was rejected. Please contact support.',
          ticketNumber: existingRegistration.ticketNumber,
          canReapply: existingRegistration.rejection?.canReapply || false,
          reapplyAfter: existingRegistration.rejection?.reapplyAfter
        });
      }

      if (existingRegistration.status === RegistrationStatus.APPROVED) {
        throw new BadRequestException({
          message: 'You are already approved. Please login to the astrologer app.',
          ticketNumber: existingRegistration.ticketNumber
        });
      }

      throw new ConflictException({
        message: 'You have already registered. Check your application status.',
        ticketNumber: existingRegistration.ticketNumber,
        status: existingRegistration.status
      });
    }

    // Generate unique ticket number
    const ticketNumber = this.generateTicketNumber();

    // Get current waitlist count
    const waitlistCount = await this.registrationModel.countDocuments({
      status: RegistrationStatus.WAITLIST
    });

    // Create new registration
    const registration = new this.registrationModel({
      name: registerDto.name,
      phoneNumber: fullPhoneNumber, // Store with country code
      email: registerDto.email,
      dateOfBirth: new Date(registerDto.dateOfBirth),
      gender: registerDto.gender,
      languagesKnown: registerDto.languagesKnown,
      skills: registerDto.skills,
      profilePicture: registerDto.profilePicture,
      bio: registerDto.bio || '',
      ticketNumber,
      status: RegistrationStatus.WAITLIST,
      waitlist: {
        joinedAt: new Date(),
        position: waitlistCount + 1,
        estimatedWaitTime: this.calculateEstimatedWaitTime(waitlistCount + 1)
      }
    });

    await registration.save();

    return {
      success: true,
      message: 'Registration successful! You have been added to the waitlist.',
      data: {
        registrationId: registration._id,
        ticketNumber: registration.ticketNumber,
        name: registration.name,
        phoneNumber: registration.phoneNumber,
        email: registration.email,
        status: registration.status,
        waitlist: {
          position: registration.waitlist.position,
          estimatedWaitTime: registration.waitlist.estimatedWaitTime,
          joinedAt: registration.waitlist.joinedAt
        },
        nextSteps: 'Our team will review your application and contact you soon for the interview process.'
      }
    };
  }

  // ========== STATUS CHECK METHODS (UPDATED) ==========

  /**
   * Get registration/onboarding status by ticket number
   * Public endpoint - candidates can check status without login
   */
  async getStatusByTicket(ticketNumber: string): Promise<any> {
    const registration = await this.registrationModel
      .findOne({ ticketNumber })
      .select('-__v')
      .lean();

    if (!registration) {
      throw new NotFoundException('Registration not found. Please check your ticket number.');
    }

    return {
      success: true,
      data: {
        ticketNumber: registration.ticketNumber,
        name: registration.name,
        phoneNumber: registration.phoneNumber,
        status: registration.status,
        currentStep: this.getCurrentStepInfo(registration),
        waitlist: registration.waitlist,
        interviews: registration.interviews,
        approval: registration.approval,
        rejection: registration.rejection,
        timeline: this.generateTimeline(registration),
        createdAt: registration.createdAt,
      }
    };
  }

  /**
   * Get registration status by phone number
   */
  async getStatusByPhone(phoneNumber: string, countryCode: string): Promise<any> {
    // Construct full phone number
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;

    const registration = await this.registrationModel
      .findOne({ phoneNumber: fullPhoneNumber })
      .select('-__v')
      .lean();

    if (!registration) {
      throw new NotFoundException('No registration found with this phone number.');
    }

    return this.getStatusByTicket(registration.ticketNumber);
  }

  // ========== HELPER METHODS (UNCHANGED) ==========

  /**
   * Helper: Generate unique ticket number
   */
  private generateTicketNumber(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `AST-${timestamp}-${random}`;
  }

  /**
   * Helper: Calculate estimated wait time
   */
  private calculateEstimatedWaitTime(position: number): string {
    if (position <= 10) return '1-2 weeks';
    if (position <= 25) return '2-3 weeks';
    if (position <= 50) return '3-4 weeks';
    return '1-2 months';
  }

  /**
   * Helper: Get current step information
   */
  private getCurrentStepInfo(registration: any): any {
    const status = registration.status;

    switch (status) {
      case RegistrationStatus.WAITLIST:
        return {
          step: 'Waitlist',
          description: 'Your application is in the waitlist. We will contact you soon.',
          action: 'Wait for admin to shortlist you',
          canProceed: false
        };

      case RegistrationStatus.SHORTLISTED:
        return {
          step: 'Shortlisted',
          description: 'Congratulations! You have been shortlisted for interviews.',
          action: 'Prepare for Round 1 - Profile Review',
          canProceed: true
        };

      case RegistrationStatus.INTERVIEW_ROUND_1:
        return {
          step: 'Interview Round 1',
          description: 'Profile Review & Document Verification',
          interviewStatus: registration.interviews.round1.status,
          action: this.getInterviewAction(registration.interviews.round1),
          canProceed: registration.interviews.round1.status === 'completed' && registration.interviews.round1.passed
        };

      case RegistrationStatus.INTERVIEW_ROUND_2:
        return {
          step: 'Interview Round 2',
          description: 'Audio Call Interview',
          interviewStatus: registration.interviews.round2.status,
          action: this.getInterviewAction(registration.interviews.round2),
          canProceed: registration.interviews.round2.status === 'completed' && registration.interviews.round2.passed
        };

      case RegistrationStatus.INTERVIEW_ROUND_3:
        return {
          step: 'Interview Round 3',
          description: 'Video Call Interview',
          interviewStatus: registration.interviews.round3.status,
          action: this.getInterviewAction(registration.interviews.round3),
          canProceed: registration.interviews.round3.status === 'completed' && registration.interviews.round3.passed
        };

      case RegistrationStatus.INTERVIEW_ROUND_4:
        return {
          step: 'Interview Round 4',
          description: 'Final Verification',
          interviewStatus: registration.interviews.round4.status,
          action: this.getInterviewAction(registration.interviews.round4),
          canProceed: registration.interviews.round4.status === 'completed' && registration.interviews.round4.approved
        };

      case RegistrationStatus.APPROVED:
        return {
          step: 'Approved',
          description: 'Congratulations! Your application has been approved.',
          action: 'Download the Astrologer app and login to complete your profile',
          canProceed: true,
          canLogin: registration.approval?.canLogin || false
        };

      case RegistrationStatus.REJECTED:
        return {
          step: 'Rejected',
          description: registration.rejection?.reason || 'Your application was not approved.',
          action: registration.rejection?.canReapply ? 'You can reapply after the specified date' : 'Contact support for more information',
          canProceed: false
        };

      default:
        return { step: 'Unknown', description: 'Status not recognized', canProceed: false };
    }
  }

  /**
   * Helper: Get interview-specific action
   */
  private getInterviewAction(interview: any): string {
    if (!interview) return 'Not scheduled yet';

    switch (interview.status) {
      case 'pending':
        return 'Waiting for admin to schedule interview';
      case 'scheduled':
        return `Interview scheduled on ${new Date(interview.scheduledAt).toLocaleDateString()}`;
      case 'completed':
        return interview.passed || interview.approved ? 'Passed! Moving to next round' : 'Interview completed';
      case 'failed':
        return 'Interview not cleared. Admin will contact you.';
      default:
        return 'Status unknown';
    }
  }

 /**
 * Helper: Generate timeline of events
 */
private generateTimeline(registration: any): TimelineEvent[] {
  const timeline: TimelineEvent[] = []; // ✅ Explicitly type the array

  // Registration
  timeline.push({
    event: 'Registered',
    date: registration.createdAt,
    status: 'completed'
  });

  // Waitlist
  if (registration.waitlist) {
    timeline.push({
      event: 'Added to Waitlist',
      date: registration.waitlist.joinedAt,
      status: 'completed',
      details: `Position: ${registration.waitlist.position}`
    });
  }

  // Shortlisted
  if (registration.status !== RegistrationStatus.WAITLIST) {
    timeline.push({
      event: 'Shortlisted',
      date: registration.updatedAt,
      status: 'completed'
    });
  }

  // Interviews
  const interviews = registration.interviews;
  
  if (interviews.round1?.scheduledAt) {
    timeline.push({
      event: 'Interview Round 1 - Profile Review',
      date: interviews.round1.scheduledAt,
      status: interviews.round1.status,
      passed: interviews.round1.passed
    });
  }

  if (interviews.round2?.scheduledAt) {
    timeline.push({
      event: 'Interview Round 2 - Audio Call',
      date: interviews.round2.scheduledAt,
      status: interviews.round2.status,
      passed: interviews.round2.passed
    });
  }

  if (interviews.round3?.scheduledAt) {
    timeline.push({
      event: 'Interview Round 3 - Video Call',
      date: interviews.round3.scheduledAt,
      status: interviews.round3.status,
      passed: interviews.round3.passed
    });
  }

  if (interviews.round4?.scheduledAt) {
    timeline.push({
      event: 'Interview Round 4 - Final Verification',
      date: interviews.round4.scheduledAt,
      status: interviews.round4.status,
      approved: interviews.round4.approved
    });
  }

  // Approval/Rejection
  if (registration.approval?.approvedAt) {
    timeline.push({
      event: 'Application Approved',
      date: registration.approval.approvedAt,
      status: 'completed'
    });
  }

  if (registration.rejection?.rejectedAt) {
    timeline.push({
      event: 'Application Rejected',
      date: registration.rejection.rejectedAt,
      status: 'rejected',
      reason: registration.rejection.reason
    });
  }

  return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

}
