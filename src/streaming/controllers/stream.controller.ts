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

  // Get live streams (public)
  @Get('live')
  async getLiveStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.streamSessionService.getLiveStreams(page, limit);
  }

  // Get scheduled streams (public)
  @Get('scheduled')
  async getScheduledStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.streamSessionService.getScheduledStreams(page, limit);
  }

  // Get stream details (public)
  @Get(':streamId')
  async getStreamDetails(@Param('streamId') streamId: string) {
    return this.streamSessionService.getStreamDetails(streamId);
  }

  // Join stream (requires auth)
  @Post(':streamId/join')
  @UseGuards(JwtAuthGuard)
  async joinStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.streamSessionService.joinStream(streamId, req.user._id);
  }

  // Leave stream (requires auth)
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

  // Get stream analytics (public for ended streams)
  @Get(':streamId/analytics')
  async getStreamAnalytics(@Param('streamId') streamId: string) {
    return this.streamAnalyticsService.getStreamAnalytics(streamId);
  }
}
