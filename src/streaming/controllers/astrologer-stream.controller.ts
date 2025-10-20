import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StreamSessionService } from '../services/stream-session.service';
import { StreamAnalyticsService } from '../services/stream-analytics.service';
import { CreateStreamDto } from '../dto/create-stream.dto';
import { UpdateStreamDto } from '../dto/update-stream.dto';
import { UpdateCallSettingsDto } from '../dto/update-call-settings.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/streams')
@UseGuards(JwtAuthGuard)
export class AstrologerStreamController {
  constructor(
    private streamSessionService: StreamSessionService,
    private streamAnalyticsService: StreamAnalyticsService,
  ) {}

  // ==================== STREAM MANAGEMENT ====================

  /**
   * Create stream
   */
  @Post()
  async createStream(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) createDto: CreateStreamDto
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.createStream({
      hostId,
      title: createDto.title,
      description: createDto.description,
      streamType: createDto.streamType,
      entryFee: createDto.entryFee,
      scheduledAt: createDto.scheduledAt ? new Date(createDto.scheduledAt) : undefined,
      thumbnailUrl: createDto.thumbnailUrl
    });
  }

  /**
   * Get my streams
   */
  @Get()
  async getMyStreams(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.getStreamsByHost(hostId, { status, page, limit });
  }

  /**
   * Start stream (go live)
   */
  @Post(':streamId/start')
  async startStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.startStream(streamId, hostId);
  }

  /**
   * End stream
   */
  @Post(':streamId/end')
  async endStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.endStream(streamId, hostId);
  }

  /**
   * Update stream
   */
  @Patch(':streamId')
  async updateStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateStreamDto
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.updateStream(streamId, hostId, updateDto);
  }

  /**
   * Delete stream (only if not started)
   */
  @Delete(':streamId')
  async deleteStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.deleteStream(streamId, hostId);
  }

  // ==================== STREAM CONTROLS ====================

  /**
   * Toggle microphone
   */
  @Post(':streamId/controls/mic')
  async toggleMic(
    @Param('streamId') streamId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.streamSessionService.toggleMic(streamId, body.enabled);
  }

  /**
   * Toggle camera
   */
  @Post(':streamId/controls/camera')
  async toggleCamera(
    @Param('streamId') streamId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.streamSessionService.toggleCamera(streamId, body.enabled);
  }

  /**
   * Switch camera (front/back)
   */
  @Post(':streamId/controls/switch-camera')
  async switchCamera(@Param('streamId') streamId: string) {
    return {
      success: true,
      message: 'Camera switched (handled on frontend)'
    };
  }

  // ==================== CALL MANAGEMENT ====================

  /**
   * Update call settings
   */
  @Patch(':streamId/call-settings')
  async updateCallSettings(
    @Param('streamId') streamId: string,
    @Body(ValidationPipe) settingsDto: UpdateCallSettingsDto
  ) {
    return this.streamSessionService.updateCallSettings(streamId, settingsDto);
  }

  /**
   * Get call waitlist
   */
  @Get(':streamId/waitlist')
  async getCallWaitlist(@Param('streamId') streamId: string) {
    return this.streamSessionService.getCallWaitlist(streamId);
  }

  /**
   * Accept call request
   */
  @Post(':streamId/waitlist/:userId/accept')
  async acceptCallRequest(
    @Param('streamId') streamId: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.acceptCallRequest(streamId, userId, hostId);
  }

  /**
   * Reject call request
   */
  @Post(':streamId/waitlist/:userId/reject')
  async rejectCallRequest(
    @Param('streamId') streamId: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.streamSessionService.rejectCallRequest(streamId, userId);
  }

  /**
   * End current call
   */
  @Post(':streamId/call/end')
  async endCurrentCall(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.endCurrentCall(streamId, hostId);
  }

  // ==================== ANALYTICS ====================

  /**
   * Get stream analytics
   */
  @Get(':streamId/analytics')
  async getStreamAnalytics(@Param('streamId') streamId: string) {
    return this.streamAnalyticsService.getStreamAnalytics(streamId);
  }

  /**
   * Get host analytics summary
   */
  @Get('analytics/summary')
  async getHostAnalytics(@Req() req: AuthenticatedRequest) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamAnalyticsService.getHostAnalytics(hostId);
  }
}
