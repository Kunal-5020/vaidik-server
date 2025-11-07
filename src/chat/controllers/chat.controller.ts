// src/chat/controllers/chat.controller.ts

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
  ValidationPipe,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';
import { EndChatDto, InitiateChatDto } from '../dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService
  ) {}

  @Get('history')
  async getChatHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const result = await this.chatSessionService.getChatHistory(req.user._id, page, limit);
    return { success: true, data: result };
  }

  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.chatSessionService.getUserActiveSessions(req.user._id);
    return { success: true, data: sessions };
  }

  @Get('unread/total')
  async getTotalUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.chatMessageService.getTotalUnreadCount(req.user._id);
    return { success: true, data: { totalUnread: count } };
  }

  @Post('initiate')
  async initiateChat(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) initiateDto: InitiateChatDto
  ) {
    return this.chatSessionService.initiateChat({
      userId: req.user._id,
      astrologerId: initiateDto.astrologerId,
      astrologerName: initiateDto.astrologerName,
      ratePerMinute: initiateDto.ratePerMinute
    });
  }

  @Post('sessions/end')
  async endSession(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) endDto: EndChatDto
  ) {
    const result = await this.chatSessionService.endSession(
      endDto.sessionId,
      req.user._id,
      endDto.reason || 'user_ended'
    );

    return {
      success: true,
      message: 'Session ended successfully',
      data: result.data
    };
  }

  @Get('sessions/:sessionId/messages')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ) {
    const result = await this.chatMessageService.getSessionMessages(sessionId, page, limit);
    return { success: true, data: result };
  }

  @Get('sessions/:sessionId/unread')
  async getUnreadCount(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const count = await this.chatMessageService.getUnreadCount(req.user._id, sessionId);
    return { success: true, data: { unreadCount: count } };
  }

  @Get('sessions/:sessionId/timer')
  async getTimerStatus(
    @Param('sessionId') sessionId: string
  ) {
    const session = await this.chatSessionService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      success: true,
      data: {
        sessionId,
        status: session.status,
        maxDurationMinutes: session.maxDurationMinutes,
        maxDurationSeconds: session.maxDurationSeconds,
        elapsedSeconds: session.timerMetrics?.elapsedSeconds || 0,
        remainingSeconds: session.timerMetrics?.remainingSeconds || 0,
        timerStatus: session.timerStatus
      }
    };
  }

  @Get('sessions/:sessionId/starred')
async getStarredMessages(
  @Param('sessionId') sessionId: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
) {
  const result = await this.chatMessageService.getStarredMessages(sessionId, page, limit);
  return { success: true, data: result };
}

@Get('sessions/:sessionId/search')
async searchMessages(
  @Param('sessionId') sessionId: string,
  @Query('q') query: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
) {
  if (!query || query.trim().length === 0) {
    throw new BadRequestException('Search query is required');
  }

  const result = await this.chatMessageService.searchMessages(sessionId, query, page, limit);
  return { success: true, data: result };
}

}
