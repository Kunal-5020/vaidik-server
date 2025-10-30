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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';
import { EndChatDto } from '../dto/end-chat.dto';
import { InitiateChatDto } from '../dto/initiate-chat.dto';
import { EditMessageDto } from '../dto/edit-message.dto';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>
  ) {}

  // ===== STATIC ROUTES FIRST =====

  // ✅ NEW: Get chat history
  @Get('history')
  async getChatHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const result = await this.chatSessionService.getChatHistory(req.user._id, page, limit);
    return {
      success: true,
      data: result
    };
  }

  // Get active sessions
  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.chatSessionService.getUserActiveSessions(req.user._id);
    return {
      success: true,
      data: sessions
    };
  }

  // ✅ NEW: Get total unread count
  @Get('unread/total')
  async getTotalUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.chatMessageService.getTotalUnreadCount(req.user._id);
    return {
      success: true,
      data: { totalUnread: count }
    };
  }

  // ✅ NEW: Initiate chat session
 @Post('initiate')
async initiateChat(
  @Req() req: AuthenticatedRequest,
  @Body(ValidationPipe) initiateDto: InitiateChatDto
) {
  // Get astrologer details
  const astrologer = await this.astrologerModel
    .findById(initiateDto.astrologerId)
    .select('name isOnline pricing') // ✅ Use isOnline
    .lean();

  if (!astrologer) {
    throw new NotFoundException('Astrologer not found');
  }

  // ✅ FIXED: Check isOnline field
  // if (!astrologer.isOnline) {
  //   throw new BadRequestException('Astrologer is currently offline');
  // }

  // Check pricing
  if (!astrologer.pricing?.chat) {
    throw new BadRequestException('Chat rate not configured for this astrologer');
  }

  // Create session
  const session = await this.chatSessionService.createSession({
    userId: req.user._id,
    astrologerId: initiateDto.astrologerId,
    astrologerName: astrologer.name,
    ratePerMinute: astrologer.pricing.chat
  });

  return {
    success: true,
    message: 'Chat session created',
    data: session
  };
}

  // End chat session (REST fallback)
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

  // ✅ NEW: Edit message (REST API)
  @Post('messages/edit')
  async editMessage(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) editDto: EditMessageDto
  ) {
    const message = await this.chatMessageService.editMessage(
      editDto.messageId,
      req.user._id,
      editDto.newContent
    );

    return {
      success: true,
      message: 'Message edited successfully',
      data: message
    };
  }

  // ===== DYNAMIC ROUTES =====

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

  // Get unread count for session
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

  // ✅ NEW: Get starred messages
  @Get('sessions/:sessionId/starred')
  async getStarredMessages(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const messages = await this.chatMessageService.getStarredMessages(req.user._id, sessionId);
    return {
      success: true,
      data: messages
    };
  }

  // ✅ NEW: Search messages
  @Get('sessions/:sessionId/search')
  async searchMessages(
    @Param('sessionId') sessionId: string,
    @Query('q') query: string
  ) {
    if (!query || query.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    const messages = await this.chatMessageService.searchMessages(sessionId, query);
    return {
      success: true,
      data: messages
    };
  }
}
