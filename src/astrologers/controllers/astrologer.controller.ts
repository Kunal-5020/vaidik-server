import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AstrologerService } from '../services/astrologer.service';

@Controller('astrologer')
@UseGuards(JwtAuthGuard) // All routes require authentication
export class AstrologerController {
  constructor(private astrologerService: AstrologerService) {}

  /**
   * Get my profile
   * GET /astrologer/profile
   */
  @Get('profile')
  async getProfile(@Request() req) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.getProfile(astrologerId);
  }

  /**
   * Get profile completion status
   * GET /astrologer/profile/completion
   */
  @Get('profile/completion')
  async getProfileCompletion(@Request() req) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.getProfileCompletionStatus(astrologerId);
  }

  /**
   * Update pricing
   * PUT /astrologer/profile/pricing
   */
  @Put('profile/pricing')
  async updatePricing(
    @Request() req,
    @Body() pricingData: { chat: number; call: number; videoCall?: number }
  ) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.updatePricing(astrologerId, pricingData);
  }


  /**
   * Update availability
   * PUT /astrologer/profile/availability
   */
  @Put('profile/availability')
  async updateAvailability(
    @Request() req,
    @Body() availabilityData: { workingHours: any[] }
  ) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.updateAvailability(astrologerId, availabilityData);
  }

  /**
   * Toggle online status
   * POST /astrologer/status/online
   */
  @Post('status/online')
  @HttpCode(HttpStatus.OK)
  async toggleOnline(
    @Request() req,
    @Body() body: { isOnline: boolean }
  ) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.toggleOnlineStatus(astrologerId, body.isOnline);
  }

  /**
   * Toggle availability
   * POST /astrologer/status/available
   */
  @Post('status/available')
  @HttpCode(HttpStatus.OK)
  async toggleAvailability(
    @Request() req,
    @Body() body: { isAvailable: boolean }
  ) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.toggleAvailability(astrologerId, body.isAvailable);
  }

  /**
   * Start live stream
   * POST /astrologer/live/start
   */
  @Post('live/start')
  @HttpCode(HttpStatus.OK)
  async startLiveStream(@Request() req) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.startLiveStream(astrologerId);
  }

  /**
   * Stop live stream
   * POST /astrologer/live/stop
   */
  @Post('live/stop')
  @HttpCode(HttpStatus.OK)
  async stopLiveStream(@Request() req) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.stopLiveStream(astrologerId);
  }

  /**
   * Get live stream status
   * GET /astrologer/live/status
   */
  @Get('live/status')
  async getLiveStreamStatus(@Request() req) {
    const astrologerId = req.user.astrologerId;
    return this.astrologerService.getLiveStreamStatus(astrologerId);
  }
}
