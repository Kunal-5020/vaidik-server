import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/core/guards/admin-auth.guard';
import { StreamSessionService } from '../services/stream-session.service';
import { StreamAnalyticsService } from '../services/stream-analytics.service';
import { StreamAgoraService } from '../services/stream-agora.service';

@Controller('admin/streams')
@UseGuards(AdminAuthGuard)
export class AdminStreamController {
  constructor(
    private streamSessionService: StreamSessionService,
    private streamAnalyticsService: StreamAnalyticsService,
    private streamAgoraService: StreamAgoraService,
  ) {}

  /**
   * Get all streams (with filters)
   */
  @Get()
  async getAllStreams(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20
  ) {
    return this.streamSessionService.getAllStreamsAdmin({ status, search, page, limit });
  }

  /**
   * Get stream statistics
   */
  @Get('stats')
  async getStreamStats() {
    return this.streamAnalyticsService.getGlobalStreamStats();
  }

  /**
   * Get currently live streams
   */
  @Get('live')
  async getLiveStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.streamSessionService.getLiveStreams(page, limit);
  }


  /**
   * Force end stream
   */
  @Post(':streamId/force-end')
  async forceEndStream(
    @Param('streamId') streamId: string,
    @Body() body: { reason: string }
  ) {
    return this.streamSessionService.forceEndStreamAdmin(streamId, body.reason);
  }

  /**
   * Get stream analytics
   */
  @Get(':streamId/analytics')
  async getStreamAnalytics(@Param('streamId') streamId: string) {
    return this.streamAnalyticsService.getStreamAnalytics(streamId);
  }

  /**
   * Get top performing streams
   */
  @Get('analytics/top-streams')
  async getTopStreams(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.streamAnalyticsService.getTopStreams(limit);
  }

  /**
   * Get top earning astrologers from streams
   */
  @Get('analytics/top-earners')
  async getTopEarners(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.streamAnalyticsService.getTopStreamEarners(limit);
  }

  @Get(':streamId/viewer-token')
async getViewerToken(@Param('streamId') streamId: string) {
  return this.streamAgoraService.generateViewerTokenByStreamId(streamId); // ✅ USE NEW METHOD
}


  /**
   * ✅ NEW: Force end active call
   * Ends the current call on the stream without stopping the stream itself
   */
  @Post(':streamId/call/force-end')
  async forceEndCall(@Param('streamId') streamId: string) {
    // Fetch stream to get the hostId required by the service
    const stream = await this.streamSessionService.getStreamById(streamId);
    if (!stream) throw new NotFoundException('Stream not found');
    
    // Use the existing service method. The second param is technically 'hostId' or 'userId' 
    // for billing/logic, using hostId ensures the host side logic triggers correctly.
    return this.streamSessionService.endCurrentCall(streamId, stream.hostId.toString());
  }
@Post(':streamId/recording/start')
  async startRecording(@Param('streamId') streamId: string) {
    return this.streamSessionService.startRecording(streamId);
  }

  @Post(':streamId/recording/stop')
  async stopRecording(@Param('streamId') streamId: string) {
    return this.streamSessionService.stopRecording(streamId);
  }
  
  /**
   * Get stream details
   */
  @Get(':streamId')
  async getStreamDetails(@Param('streamId') streamId: string) {
    return this.streamSessionService.getStreamDetailsAdmin(streamId);
  }
}
