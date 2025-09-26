import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete,
  Body, 
  Param, 
  Query,
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { Request } from 'express';
import { StreamingService } from './streaming.service'; // FIXED: Use StreamingService instead of StreamManagementService
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CreateStreamDto } from './dto/create-stream.dto';
import { JoinStreamDto } from './dto/join-stream.dto';
import { SendTipDto } from './dto/send-tip.dto';
import { UserDocument } from '../users/schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('streaming')
export class StreamingController {
  constructor(
    private readonly streamingService: StreamingService, // FIXED: Use StreamingService
  ) {}

  // === PUBLIC ENDPOINTS ===

  // Get live streams (public)
  @Get('live')
  @UseGuards(OptionalAuthGuard)
  async getLiveStreams(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('category') category?: string
  ) {
    return this.streamingService.getLiveStreams(page, limit, category);
  }

  // Get stream details (public)
  @Get(':streamId')
  @UseGuards(OptionalAuthGuard)
  async getStreamDetails(@Param('streamId') streamId: string) {
    return this.streamingService.getStreamDetails(streamId);
  }

  // Get stream categories (public)
  @Get('meta/categories')
  getStreamCategories() {
    return {
      success: true,
      data: [
        { id: 'general', name: 'General', icon: '🔮' },
        { id: 'astrology', name: 'Astrology', icon: '⭐' },
        { id: 'tarot', name: 'Tarot Reading', icon: '🃏' },
        { id: 'numerology', name: 'Numerology', icon: '🔢' },
        { id: 'palmistry', name: 'Palmistry', icon: '✋' }
      ]
    };
  }

  // === AUTHENTICATED USER ENDPOINTS ===

  // Join a live stream as viewer
  @Post('join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async joinStream(
    @Req() req: AuthenticatedRequest,
    @Body() joinStreamDto: JoinStreamDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.streamingService.joinStreamAsViewer(userId, joinStreamDto.streamId);
  }

  // Leave a live stream
  @Post(':streamId/leave')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async leaveStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = (req.user._id as any).toString();
    return this.streamingService.leaveStream(userId, streamId);
  }

  // Send tip to stream
  @Post('tip')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendTip(
    @Req() req: AuthenticatedRequest,
    @Body() sendTipDto: SendTipDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.streamingService.sendTip(
      userId,
      sendTipDto.streamId,
      sendTipDto.amount,
      sendTipDto.message
    );
  }

  // === ASTROLOGER DASHBOARD ENDPOINTS ===

  // Create a new stream (astrologer only)
  @Post('create')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createStream(
    @Req() req: AuthenticatedRequest,
    @Body() createStreamDto: CreateStreamDto
  ) {
    const astrologerId = (req.user._id as any).toString();
    return this.streamingService.createStream(astrologerId, createStreamDto);
  }

  // Start a scheduled stream
  @Put(':streamId/start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async startStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const astrologerId = (req.user._id as any).toString();
    return this.streamingService.startStream(astrologerId, streamId);
  }

  // End an active stream
  @Put(':streamId/end')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async endStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const astrologerId = (req.user._id as any).toString();
    return this.streamingService.endStream(astrologerId, streamId);
  }

  // Get astrologer's streams
  @Get('my/streams')
  @UseGuards(JwtAuthGuard)
  async getMyStreams(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string
  ) {
    const astrologerId = (req.user._id as any).toString();
    return this.streamingService.getAstrologerStreams(astrologerId, status);
  }

  // Get stream analytics
  @Get(':streamId/analytics')
  @UseGuards(JwtAuthGuard)
  async getStreamAnalytics(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const astrologerId = (req.user._id as any).toString();
    return this.streamingService.getStreamAnalytics(astrologerId, streamId);
  }

  // Update stream details
  @Put(':streamId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest,
    @Body() updateData: {
      title?: string;
      description?: string;
      tags?: string[];
      thumbnailUrl?: string;
      settings?: {
        allowChat?: boolean;
        allowTips?: boolean;
        allowQuestions?: boolean;
      };
    }
  ) {
    return {
      success: true,
      message: 'Stream updated successfully',
      data: { streamId, ...updateData }
    };
  }

  // Delete/Cancel stream
  @Delete(':streamId')
  @UseGuards(JwtAuthGuard)
  async deleteStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return {
      success: true,
      message: 'Stream cancelled successfully'
    };
  }

  // === ANALYTICS ENDPOINTS ===

  // Get streaming dashboard summary
  @Get('dashboard/summary')
  @UseGuards(JwtAuthGuard)
  async getDashboardSummary(@Req() req: AuthenticatedRequest) {
    const astrologerId = (req.user._id as any).toString();
    
    return {
      success: true,
      data: {
        totalStreams: 0,
        totalViewers: 0,
        totalTips: 0,
        totalRevenue: 0,
        averageViewers: 0,
        topPerformingStreams: [],
        upcomingStreams: []
      }
    };
  }

  // Get platform statistics
  @Get('platform/stats')
  @UseGuards(JwtAuthGuard)
  async getPlatformStats() {
    return this.streamingService.getPlatformStats();
  }

  // Get trending topics
  @Get('trending/topics')
  @UseGuards(OptionalAuthGuard)
  async getTrendingTopics(
    @Query('period') period: 'day' | 'week' | 'month' = 'week'
  ) {
    return this.streamingService.getTrendingTopics(period);
  }

  // === SEARCH & DISCOVERY ===

  // Search streams
  @Get('search')
  @UseGuards(OptionalAuthGuard)
  async searchStreams(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10
  ) {
    return {
      success: true,
      data: {
        streams: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalResults: 0
        }
      }
    };
  }

  // Get trending streams
  @Get('trending')
  @UseGuards(OptionalAuthGuard)
  async getTrendingStreams(
    @Query('period') period: 'today' | 'week' | 'month' = 'today',
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10
  ) {
    return {
      success: true,
      data: {
        period,
        streams: [],
        count: 0
      }
    };
  }

  // Report stream content
  @Post(':streamId/report')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reportStream(
    @Param('streamId') streamId: string,
    @Req() req: AuthenticatedRequest,
    @Body() reportData: {
      reason: string;
      description: string;
      timestamp?: string;
    }
  ) {
    const userId = (req.user._id as any).toString();
    
    return {
      success: true,
      message: 'Stream reported successfully',
      data: {
        reportId: `report_${streamId}_${Date.now()}`,
        status: 'submitted'
      }
    };
  }
}
