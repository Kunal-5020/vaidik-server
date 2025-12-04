import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AstrologersService } from '../services/astrologers.service';
import { AstrologerService } from '../services/astrologer.service';
import { AvailabilityService } from '../services/availability.service';
import { ProfileChangeService } from '../services/profile-change.service';
import { EarningsService } from '../services/earnings.service';
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';
import { UpdateWorkingHoursDto } from '../dto/update-working-hours.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import { RequestProfileChangeDto } from '../dto/request-profile-change.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer')
@UseGuards(JwtAuthGuard)
export class AstrologerProfileController {
  constructor(
    private astrologersService: AstrologersService,
    private astrologerService: AstrologerService,
    private availabilityService: AvailabilityService,
    private profileChangeService: ProfileChangeService,
    private earningsService: EarningsService,
  ) {}

  // ===== PROFILE MANAGEMENT =====

  /**
   * ✅ NEW: Get complete profile with all details
   * GET /astrologer/profile/complete
   */
  @Get('profile/complete')
  async getCompleteProfile(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.getCompleteProfile(astrologerId);
  }

  /**
   * Get my profile (basic)
   * GET /astrologer/profile
   */
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.getOwnProfile(astrologerId);
  }

  /**
   * Get profile completion status
   * GET /astrologer/profile/completion
   */
  @Get('profile/completion')
  async getProfileCompletion(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.getProfileCompletionStatus(astrologerId);
  }

  /**
   * Update profile (minor changes)
   * PATCH /astrologer/profile
   */
  @Patch('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAstrologerProfileDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.updateProfile(astrologerId, updateDto);
  }

  /**
   * Update pricing
   * PATCH /astrologer/profile/pricing
   */
  @Patch('profile/pricing')
  async updatePricing(
    @Req() req: AuthenticatedRequest,
    @Body() pricingData: { chat: number; call: number; videoCall?: number }
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.updatePricing(astrologerId, pricingData);
  }

  // ===== AVAILABILITY MANAGEMENT =====

  /**
   * Get availability/working hours
   * GET /astrologer/availability
   */
  @Get('availability')
  async getAvailability(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.getWorkingHours(astrologerId);
  }

  /**
   * Update working hours
   * PATCH /astrologer/profile/working-hours
   */
  @Patch('profile/working-hours')
  async updateWorkingHours(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateWorkingHoursDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateWorkingHours(astrologerId, updateDto);
  }

  /**
   * Update availability status
   * PATCH /astrologer/availability
   */
  @Patch('availability')
  async updateAvailability(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAvailabilityDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateAvailability(astrologerId, updateDto);
  }

  /**
   * Toggle online status
   * POST /astrologer/status/online
   */
  @Post('status/online')
  @HttpCode(HttpStatus.OK)
  async toggleOnline(
    @Req() req: AuthenticatedRequest,
    @Body() body: { isOnline: boolean }
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.toggleOnlineStatus(astrologerId, body.isOnline);
  }

  /**
   * Toggle availability
   * POST /astrologer/status/available
   */
  @Post('status/available')
  @HttpCode(HttpStatus.OK)
  async toggleAvailability(
    @Req() req: AuthenticatedRequest,
    @Body() body: { isAvailable: boolean }
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.toggleAvailability(astrologerId, body.isAvailable);
  }

  // ===== LIVE STREAMING =====

  /**
   * Get live stream status
   * GET /astrologer/live/status
   */
  @Get('live/status')
  async getLiveStreamStatus(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.getLiveStreamStatus(astrologerId);
  }

  // ===== PROFILE CHANGE REQUESTS =====

  /**
   * Request profile change (for major changes)
   * POST /astrologer/profile/change-request
   */
  @Post('profile/change-request')
  async requestProfileChange(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) requestDto: RequestProfileChangeDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.profileChangeService.requestChange(astrologerId, requestDto);
  }

  /**
   * Get my change requests
   * GET /astrologer/profile/change-requests
   */
  @Get('profile/change-requests')
  async getMyChangeRequests(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.profileChangeService.getMyChangeRequests(astrologerId);
  }

  // ===== EARNINGS =====

  /**
   * Get earnings summary
   * GET /astrologer/earnings
   */
  @Get('earnings')
  async getEarnings(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.earningsService.getEarningsSummary(astrologerId);
  }
}
