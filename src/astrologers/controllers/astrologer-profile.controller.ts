import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AstrologersService } from '../services/astrologers.service';
import { AvailabilityService } from '../services/availability.service';
import { ProfileChangeService } from '../services/profile-change.service';
import { EarningsService } from '../services/earnings.service';
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';
import { UploadGalleryPhotoDto } from '../dto/upload-gallery-photo.dto';
import { RemoveGalleryPhotoDto } from '../dto/remove-gallery-photo.dto';
import { UploadIntroAudioDto } from '../dto/upload-intro-audio.dto';
import { UpdateWorkingHoursDto } from '../dto/update-working-hours.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import { RequestProfileChangeDto } from '../dto/request-profile-change.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/profile')
@UseGuards(JwtAuthGuard)
export class AstrologerProfileController {
  constructor(
    private astrologersService: AstrologersService,
    private availabilityService: AvailabilityService,
    private profileChangeService: ProfileChangeService,
    private earningsService: EarningsService,
  ) {}

  // ===== PROFILE MANAGEMENT =====

  /**
   * Get my profile
   * GET /astrologer/profile
   */
  @Get()
  async getOwnProfile(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.getOwnProfile(astrologerId);
  }

  /**
   * Update profile (minor changes)
   * PATCH /astrologer/profile
   */
  @Patch()
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAstrologerProfileDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.updateProfile(astrologerId, updateDto);
  }

  // ===== GALLERY MANAGEMENT =====

  /**
   * Add photo to gallery
   * POST /astrologer/profile/gallery
   */
  @Post('gallery')
  async addGalleryPhoto(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) uploadDto: UploadGalleryPhotoDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.addGalleryPhoto(
      astrologerId,
      uploadDto.photoUrl,
      uploadDto.s3Key
    );
  }

  /**
   * Remove photo from gallery
   * DELETE /astrologer/profile/gallery
   */
  @Delete('gallery')
  @HttpCode(HttpStatus.OK)
  async removeGalleryPhoto(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) removeDto: RemoveGalleryPhotoDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.removeGalleryPhoto(astrologerId, removeDto.s3Key);
  }

  // ===== INTRO AUDIO MANAGEMENT =====

  /**
   * Upload intro audio
   * POST /astrologer/profile/intro-audio
   */
  @Post('intro-audio')
  async uploadIntroAudio(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) uploadDto: UploadIntroAudioDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.uploadIntroAudio(
      astrologerId,
      uploadDto.audioUrl,
      uploadDto.s3Key,
      uploadDto.duration
    );
  }

  /**
   * Delete intro audio
   * DELETE /astrologer/profile/intro-audio
   */
  @Delete('intro-audio')
  @HttpCode(HttpStatus.OK)
  async deleteIntroAudio(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.deleteIntroAudio(astrologerId);
  }

  // ===== AVAILABILITY MANAGEMENT =====

  /**
   * Get availability/working hours
   * GET /astrologer/profile/availability
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
  @Patch('working-hours')
  async updateWorkingHours(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateWorkingHoursDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateWorkingHours(astrologerId, updateDto);
  }

  /**
   * Update availability status
   * PATCH /astrologer/profile/availability
   */
  @Patch('availability')
  async updateAvailability(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAvailabilityDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateAvailability(astrologerId, updateDto);
  }

  // ===== PROFILE CHANGE REQUESTS =====

  /**
   * Request profile change (for major changes)
   * POST /astrologer/profile/change-request
   */
  @Post('change-request')
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
  @Get('change-requests')
  async getMyChangeRequests(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.profileChangeService.getMyChangeRequests(astrologerId);
  }

  // ===== EARNINGS =====

  /**
   * Get earnings summary
   * GET /astrologer/profile/earnings
   */
  @Get('earnings')
  async getEarnings(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.earningsService.getEarningsSummary(astrologerId);
  }
}
