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
  Delete,
  ForbiddenException
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';
import { EndChatDto, InitiateChatDto } from '../dto';
import { AstrologerAcceptChatDto, AstrologerRejectChatDto } from '../dto';
import { OrdersService } from '../../orders/services/orders.service';
import { UploadService } from '../../upload/services/upload.service';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
    private ordersService: OrdersService,
    private uploadService: UploadService,
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

@Post('upload/media')
@UseInterceptors(FileInterceptor('file'))
async uploadChatMedia(
  @UploadedFile() file: Express.Multer.File,
  @Body('type') type: 'image' | 'video' | 'audio',
  @Req() req: AuthenticatedRequest
) {
  if (!file) {
    throw new BadRequestException('No file uploaded');
  }

  let result;
  
  if (type === 'image') {
    result = await this.uploadService.uploadImage(file);
  } else if (type === 'video') {
    result = await this.uploadService.uploadVideo(file);
  } else if (type === 'audio') {
    result = await this.uploadService.uploadAudio(file);
  } else {
    throw new BadRequestException('Invalid media type. Use: image, video, or audio');
  }

  return {
    success: true,
    message: 'Media uploaded successfully',
    data: {
      url: result.url,
      s3Key: result.key,
      filename: result.filename,
      size: result.size,
      mimeType: result.mimeType,
      type
    }
  };
}

/**
 * Get astrologer's chat sessions
 * GET /chat/astrologer/sessions
 */
@Get('astrologer/sessions')
async getAstrologerChatSessions(
  @Req() req: AuthenticatedRequest,
  @Query('page') page: string = '1',
  @Query('limit') limit: string = '20',
  @Query('status') status?: string
) {
  return this.chatSessionService.getAstrologerChatSessions(
    req.user._id,
    {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    }
  );
}

/**
 * Get astrologer chat session details
 * GET /chat/astrologer/sessions/:sessionId
 */
@Get('astrologer/sessions/:sessionId')
async getAstrologerChatSessionDetails(
  @Param('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  return this.chatSessionService.getAstrologerChatSessionDetails(sessionId, req.user._id);
}

@Get('astrologer/conversations/:orderId/messages')
  async getAstrologerConversationMessages(
    @Param('orderId') orderId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Req() req: AuthenticatedRequest
  ) {
    // 1. Validate Order Ownership for Astrologer
    // We call a specific service method (defined below) or you can use your generic findOne
    const orderDetails = await this.ordersService.getAstrologerOrderDetails(
      orderId, 
      req.user._id
    );

    const order = orderDetails.data;

    // Double check (Safety)
    if (order.astrologerId?._id?.toString() !== req.user._id.toString()) {
      throw new ForbiddenException('You are not the authorized astrologer for this conversation');
    }

    // 2. Fetch Messages with Strict 'Astrologer' Role
    // This ensures they see what is 'isVisibleToAstrologer'
    const messagesResult = await this.chatMessageService.getConversationMessages(
      orderId,
      page,
      limit,
      req.user._id,
      'Astrologer' // <--- HARDCODED ROLE
    );

    // 3. Extract Meta Data
    const astrologer: any = order.astrologerId;
    const user: any = order.userId;

    return { 
      success: true, 
      data: {
        ...messagesResult,
        meta: {
          role: 'Astrologer',
          isRestricted: !order.userPrivacy?.allowChatHistory, // Example: Check privacy flag if needed
          astrologer: {
            _id: astrologer?._id,
            name: astrologer?.name,
            profilePicture: astrologer?.profilePicture,
            currentRate: astrologer?.pricing?.chat,
          },
          user: {
            _id: user?._id,
            name: user?.name,
            profilePicture: user?.profilePicture,
            // Include privacy settings so frontend can block media downloads etc.
            privacy: user?.privacy || {} 
          }
        }
      } 
    };
  }


// ===== GET ALL CONVERSATION MESSAGES (across all sessions) =====
@Get('conversations/:orderId/messages')
  async getConversationMessages(
    @Param('orderId') orderId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Req() req: AuthenticatedRequest
  ) {
    // 1. Fetch Order Details FIRST to determine the role of the requester
    // We assume getOrderDetails checks if req.user._id is a participant (User OR Astrologer)
    const orderDetails = await this.ordersService.getOrderDetails(orderId, req.user._id);
    const order = orderDetails.data;
    
    // 2. Determine the Role (User or Astrologer)
    // We compare strings to ensure ObjectId matching works
    const isAstrologer = order.astrologerId?._id?.toString() === req.user._id.toString();
    const isUser = order.userId?._id?.toString() === req.user._id.toString();

    // Determine role for visibility filtering
    let role: 'User' | 'Astrologer' = 'User'; // Default
    if (isAstrologer) role = 'Astrologer';
    else if (isUser) role = 'User';

    // 3. Fetch Messages with the specific Role
    const messagesResult = await this.chatMessageService.getConversationMessages(
      orderId,
      page,
      limit,
      req.user._id,
      role // <--- Pass the determined role here
    );

    // 4. Extract Populated Fields for Meta Response
    const astrologer: any = order.astrologerId;
    const user: any = order.userId; 

    return { 
      success: true, 
      data: {
        ...messagesResult, // Spread pagination & messages
        meta: {
          role: role, // Optional: Return the detected role for frontend reference
          astrologer: {
            _id: astrologer?._id,
            name: astrologer?.name,
            profilePicture: astrologer?.profilePicture,
            currentRate: astrologer?.pricing?.chat,
          },
          user: {
            _id: user?._id,
            name: user?.name,
            profilePicture: user?.profilePicture,
            privacy: user?.privacy || {} 
          }
        }
      } 
    };
  }

// ===== GET CONVERSATION SUMMARY =====
@Get('conversations/:orderId/summary')
async getConversationSummary(
  @Param('orderId') orderId: string,
  @Req() req: AuthenticatedRequest
) {
  const order = await this.ordersService.getOrderDetails(orderId, req.user._id);
  
  const astrologerData = order.data.astrologerId; 

    return {
      success: true,
      data: {
        orderId: order.data.orderId,
        conversationThreadId: order.data.conversationThreadId,
        // ✅ Return the full populated object directly or map cleanly
        astrologer: {
          _id: astrologerData._id,
          name: astrologerData.name,
          profilePicture: astrologerData.profilePicture,
          experienceYears: astrologerData.experienceYears,
          specializations: astrologerData.specializations,
          rating: astrologerData.ratings?.average || 0,
          chatRate: astrologerData.pricing?.chat || 0,
          callRate: astrologerData.pricing?.call || 0,
          videoCallRate: astrologerData.pricing?.videoCall || 0
        },
        // Also pass rate from order if needed for display
        ratePerMinute: order.data.ratePerMinute,
        
        currentSessionId: order.data.currentSessionId,
        currentSessionType: order.data.currentSessionType,
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
    @Query('page') page: number
  ) {
    // Works via HTTP, returns filtered list
    return this.chatMessageService.searchMessages(sessionId, query, page);
  }

@Post('messages/:messageId/star')
  async starMessage(@Param('messageId') messageId: string, @Req() req) {
    return this.chatMessageService.starMessage(messageId, req.user._id);
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
    @Req() req
  ) {
    return this.chatMessageService.deleteMessage(messageId, req.user._id, deleteFor);
  }

@Get('conversations/:orderId/starred')
  async getConversationStarredMessages(@Param('orderId') orderId: string, @Req() req) {
    return this.chatMessageService.getConversationStarredMessages(orderId, req.user._id);
  }
}

