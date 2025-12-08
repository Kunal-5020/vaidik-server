import {
  Controller,
  Get,
  Post,
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
import { JoinStreamDto } from '../dto/join-stream.dto';
import { RequestCallDto } from '../dto/request-call.dto';
import { SendGiftDto } from '../dto/send-gift.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('streams')
export class StreamController {
  constructor(
    private streamSessionService: StreamSessionService,
    private streamAnalyticsService: StreamAnalyticsService,
  ) {}

  // ==================== PUBLIC ENDPOINTS ====================

  /**
   * Get live streams (public)
   */
  @Get('live')
  async getLiveStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.streamSessionService.getLiveStreams(page, limit);
  }

  /**
   * Get scheduled streams (public)
   */
  @Get('scheduled')
  async getScheduledStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.streamSessionService.getScheduledStreams(page, limit);
  }

  /**
   * Get stream details (public)
   */
  @Get(':streamId')
  async getStreamDetails(@Param('streamId') streamId: string) {
    return this.streamSessionService.getStreamDetails(streamId);
  }

  /**
   * Get stream analytics (public for ended streams)
   */
  @Get(':streamId/analytics')
  async getStreamAnalytics(@Param('streamId') streamId: string) {
    return this.streamAnalyticsService.getStreamAnalytics(streamId);
  }

  // ==================== PROTECTED ENDPOINTS ====================

  /**
   * Join stream (requires auth)
   */
  @Post(':streamId/join')
  @UseGuards(JwtAuthGuard)
  async joinStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.streamSessionService.joinStream(streamId, req.user._id);
  }

  /**
   * Leave stream (requires auth)
   */
  @Post(':streamId/leave')
  @UseGuards(JwtAuthGuard)
  async leaveStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    await this.streamSessionService.leaveStream(streamId, req.user._id);
    return {
      success: true,
      message: 'Left stream successfully'
    };
  }

  /**
   * Request call in stream
   */
  @Post(':streamId/call/request')
  @UseGuards(JwtAuthGuard)
  async requestCall(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) requestDto: RequestCallDto
  ) {
    return this.streamSessionService.requestCall(
      streamId,
      req.user._id,
      requestDto.callType,
      requestDto.callMode
    );
  }

  /**
   * Cancel call request
   */
  @Post(':streamId/call/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelCallRequest(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.streamSessionService.cancelCallRequest(streamId, req.user._id);
  }

  /**
   * Update call mode (public/private) during call
   */
  @Post(':streamId/call/mode')
  @UseGuards(JwtAuthGuard)
  async updateCallMode(
    @Param('streamId') streamId: string,
    @Body() body: { mode: 'public' | 'private' }
  ) {
    return this.streamSessionService.updateCallMode(streamId, body.mode);
  }

  /**
   * Toggle user camera during call
   */
  @Post(':streamId/call/toggle-camera')
  @UseGuards(JwtAuthGuard)
  async toggleUserCamera(
    @Param('streamId') streamId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.streamSessionService.toggleUserCamera(streamId, body.enabled);
  }


/**
 * End user's own call
 * POST /streams/:streamId/call/end-user-call
 */
@Post(':streamId/call/end-user-call')
@UseGuards(JwtAuthGuard)
async endUserCall(
  @Param('streamId') streamId: string,
  @Req() req: AuthenticatedRequest
) {
  const userId = req.user._id;
  return this.streamSessionService.endUserCall(streamId, userId);
}

}
