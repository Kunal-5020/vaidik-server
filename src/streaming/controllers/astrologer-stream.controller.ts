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
   * ✅ INSTANT GO LIVE
   */
  @Post('go-live')
  async goLive(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) settings: CreateStreamDto
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.goLive(hostId, settings);
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

  // ==================== CALL MANAGEMENT ====================


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
