import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, Req } from '@nestjs/common';
import { ChatSessionService } from './services/chat-session.service';
import { MessageService } from './services/message.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatSessionService: ChatSessionService,
    private readonly messageService: MessageService,
  ) {}

  // Get chat session info
  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    return await this.chatSessionService.getSession(sessionId);
  }

  // Get message history for session
  @Get('sessions/:sessionId/messages')
  async getMessages(@Param('sessionId') sessionId: string) {
    return await this.messageService.getMessagesForSession(sessionId);
  }

  // Get active sessions for user or astrologer
  @Get('sessions')
  async getUserSessions(@Req() req) {
    const userId = req.user._id;
    return await this.chatSessionService.getUserSessions(userId);
  }
}
