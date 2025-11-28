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
  BadRequestException,
  Delete
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';
import { EndChatDto, InitiateChatDto } from '../dto';
import { AstrologerAcceptChatDto, AstrologerRejectChatDto } from '../dto';
import { OrdersService } from '../../orders/services/orders.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
    private ordersService: OrdersService
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

    // ===== ASTROLOGER ACCEPT CHAT =====
  @Post('astrologer/accept')
  async astrologerAcceptChat(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: AstrologerAcceptChatDto,
  ) {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const result = await this.chatSessionService.acceptChat(
      body.sessionId,
      req.user._id, // astrologerId from JWT
    );

    // ChatSessionService.acceptChat already returns { success, message, status }
    return {
      success: true,
      message: result.message,
      data: {
        status: result.status,
      },
    };
  }

  // ===== ASTROLOGER REJECT CHAT =====
  @Post('astrologer/reject')
  async astrologerRejectChat(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) body: AstrologerRejectChatDto,
  ) {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const reason = body.reason || 'astrologer_rejected';

    const result = await this.chatSessionService.rejectChat(
      body.sessionId,
      req.user._id, // astrologerId from JWT
      reason,
    );

    return {
      success: true,
      message: result.message,
    };
  }

  @Post('continue')
async continueChat(
  @Req() req: AuthenticatedRequest,
  @Body() body: {
    astrologerId: string;
    previousSessionId: string;
    ratePerMinute: number;
  }
) {
  return this.chatSessionService.continueChat({
    userId: req.user._id,
    astrologerId: body.astrologerId,
    previousSessionId: body.previousSessionId,
    ratePerMinute: body.ratePerMinute,
  });
}

// ===== GET ALL CONVERSATION MESSAGES (across all sessions) =====
@Get('conversations/:orderId/messages')
async getConversationMessages(
  @Param('orderId') orderId: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  @Req() req: AuthenticatedRequest
) {
  const result = await this.chatMessageService.getConversationMessages(
    orderId,
    page,
    limit,
    req.user._id
  );
  return { success: true, data: result };
}

// ===== GET CONVERSATION SUMMARY =====
@Get('conversations/:orderId/summary')
async getConversationSummary(
  @Param('orderId') orderId: string,
  @Req() req: AuthenticatedRequest
) {
  const order = await this.ordersService.getOrderDetails(orderId, req.user._id);
  
  return {
    success: true,
    data: {
      orderId: order.data.orderId,
      conversationThreadId: order.data.conversationThreadId,
      astrologer: {
        id: order.data.astrologerId,
        name: order.data.astrologerName
      },
      totalSessions: order.data.totalSessions,
      totalChatSessions: order.data.totalChatSessions,
      totalCallSessions: order.data.totalCallSessions,
      totalSpent: order.data.totalAmount,
      totalDuration: order.data.totalUsedDurationSeconds,
      sessionHistory: order.data.sessionHistory,
      lastInteractionAt: order.data.lastInteractionAt,
      messageCount: order.data.messageCount,
      createdAt: order.data.createdAt
    }
  };
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

@Post('messages/:messageId/star')
async starMessage(
  @Param('messageId') messageId: string,
  @Body('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  const message = await this.chatMessageService.starMessage(messageId, req.user._id);
  
  if (!message) {
    throw new BadRequestException('Failed to star message');
  }

  return { 
    success: true, 
    message: 'Message starred',
    data: {
      messageId,
      isStarred: true,
      starredBy: message.starredBy,
    }
  };
}

@Delete('messages/:messageId/star')
async unstarMessage(
  @Param('messageId') messageId: string,
  @Body('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  const message = await this.chatMessageService.unstarMessage(messageId, req.user._id);
  
  if (!message) {
    throw new BadRequestException('Failed to unstar message');
  }

  return { 
    success: true, 
    message: 'Star removed',
    data: {
      messageId,
      isStarred: message.isStarred || false,
      starredBy: message.starredBy || [],
    }
  };
}

@Post('messages/:messageId/delete')
async deleteMessage(
  @Param('messageId') messageId: string,
  @Body('deleteFor') deleteFor: 'sender' | 'everyone',
  @Req() req: AuthenticatedRequest
) {
  await this.chatMessageService.deleteMessage(
    messageId,
    req.user._id,
    deleteFor
  );

  return { 
    success: true, 
    message: 'Message deleted',
    data: { messageId, deleteFor }
  };
}

@Get('conversations/:orderId/starred')
async getConversationStarredMessages(
  @Param('orderId') orderId: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  @Req() req: AuthenticatedRequest
) {
  // Get all starred messages across all sessions in conversation
  const result = await this.chatMessageService.getConversationStarredMessages(
    orderId,
    req.user._id,
    page,
    limit
  );
  
  return { success: true, data: result };
}

}
