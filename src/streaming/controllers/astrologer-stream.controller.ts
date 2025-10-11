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

  // Create stream
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

  // Get my streams
  @Get()
  async getMyStreams(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    // You can add a method in service to get streams by hostId with filters
    return {
      success: true,
      message: 'Implement getStreamsByHost method'
    };
  }

  // Start stream (go live)
  @Post(':streamId/start')
  async startStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.startStream(streamId, hostId);
  }

  // End stream
  @Post(':streamId/end')
  async endStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamSessionService.endStream(streamId, hostId);
  }

  // Update stream
  @Patch(':streamId')
  async updateStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateStreamDto
  ) {
    // Implement update stream method
    return {
      success: true,
      message: 'Stream updated successfully'
    };
  }

  // Delete stream (only if not started)
  @Delete(':streamId')
  async deleteStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    // Implement delete stream method
    return {
      success: true,
      message: 'Stream deleted successfully'
    };
  }

  // Get stream analytics
  @Get(':streamId/analytics')
  async getStreamAnalytics(@Param('streamId') streamId: string) {
    return this.streamAnalyticsService.getStreamAnalytics(streamId);
  }

  // Get host analytics
  @Get('analytics/summary')
  async getHostAnalytics(@Req() req: AuthenticatedRequest) {
    const hostId = req.user.astrologerId || req.user._id;
    return this.streamAnalyticsService.getHostAnalytics(hostId);
  }
}
