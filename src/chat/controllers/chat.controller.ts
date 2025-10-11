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
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';
import { EndChatDto } from '../dto/end-chat.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
  ) {}

  // Get active sessions
  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.chatSessionService.getUserActiveSessions(req.user._id);
    return {
      success: true,
      data: sessions
    };
  }

  // Get session messages
  @Get('sessions/:sessionId/messages')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ) {
    const result = await this.chatMessageService.getSessionMessages(sessionId, page, limit);
    return {
      success: true,
      data: result
    };
  }

  // End chat session (REST API fallback)
  @Post('sessions/end')
  async endSession(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) endDto: EndChatDto
  ) {
    const session = await this.chatSessionService.endSession(
      endDto.sessionId,
      req.user._id,
      endDto.reason
    );

    return {
      success: true,
      message: 'Session ended successfully',
      data: session
    };
  }

  // Get unread message count
  @Get('sessions/:sessionId/unread')
  async getUnreadCount(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const count = await this.chatMessageService.getUnreadCount(req.user._id, sessionId);
    return {
      success: true,
      data: { unreadCount: count }
    };
  }
}
