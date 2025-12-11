// src/calls/controllers/call.controller.ts

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
import { CallSessionService } from '../services/call-session.service';
import { EndCallDto, InitiateCallDto } from '../dto';
import { CallBillingService } from '../services/call-billing.service';
import { CallGateway } from '../gateways/calls.gateway';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(
    private callSessionService: CallSessionService,
    private callBillingService: CallBillingService,
    private callGateway: CallGateway
  ) {}

  // ===== GET STATISTICS =====
  @Get('stats/summary')
  async getCallStats(@Req() req: AuthenticatedRequest) {
    const activeSessions = await this.callSessionService.getUserActiveSessions(req.user._id);
    const history = await this.callSessionService.getCallHistory(req.user._id, 1, 1);

    return {
      success: true,
      data: {
        activeCalls: activeSessions.length,
        totalCalls: history.pagination.total,
        pagination: history.pagination
      }
    };
  }

  // ===== GET ACTIVE CALLS =====
  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.callSessionService.getUserActiveSessions(req.user._id);
    return { success: true, data: sessions };
  }

  // ===== GET CALL HISTORY =====
  @Get('history')
  async getCallHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const result = await this.callSessionService.getCallHistory(req.user._id, page, limit);
    return { success: true, data: result };
  }

  // ===== INITIATE CALL =====
  @Post('initiate')
  async initiateCall(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) initiateDto: InitiateCallDto
  ) {
    return this.callSessionService.initiateCall({
      userId: req.user._id,
      astrologerId: initiateDto.astrologerId,
      astrologerName: initiateDto.astrologerName,
      callType: initiateDto.callType,
      ratePerMinute: initiateDto.ratePerMinute
    });
  }

  // ===== END CALL =====
  @Post('sessions/end')
  async endCall(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) endDto: EndCallDto
  ) {
    const result = await this.callGateway.terminateCall(
      endDto.sessionId,
      req.user._id,
      endDto.reason || 'user_ended'
    );

    return {
      success: true,
      message: 'Call ended successfully',
      data: result.data
    };
  }

  // ===== ASTROLOGER: ACCEPT CALL =====
@Post('astrologer/accept')
async acceptCallAsAstrologer(
  @Req() req: AuthenticatedRequest,
  @Body('sessionId', new ValidationPipe({ transform: true })) sessionId: string,
) {
  if (!sessionId) {
    throw new BadRequestException('sessionId is required');
  }

  const astrologerId = req.user._id;
  const result = await this.callSessionService.acceptCall(sessionId, astrologerId);
  await this.callGateway.notifyUserOfAcceptance(sessionId, astrologerId);

  return {
    success: true,
    message: 'Call accepted',
    data: result,
  };
}

// ===== ASTROLOGER: REJECT CALL =====
@Post('astrologer/reject')
async rejectCallAsAstrologer(
  @Req() req: AuthenticatedRequest,
  @Body('sessionId', new ValidationPipe({ transform: true })) sessionId: string,
  @Body('reason') reason: string,
) {
  if (!sessionId) {
    throw new BadRequestException('sessionId is required');
  }

  const astrologerId = req.user._id;
  const rejectReason = reason || 'astrologer_rejected';

  const result = await this.callGateway.rejectCall(
      sessionId,
      astrologerId,
      rejectReason
    );

  return {
    success: true,
    message: 'Call rejected',
    data: result,
  };
}

/**
 * Get astrologer's call sessions
 * GET /calls/astrologer/sessions
 */
@Get('astrologer/sessions')
async getAstrologerCallSessions(
  @Req() req: AuthenticatedRequest,
  @Query('page') page: string = '1',
  @Query('limit') limit: string = '20',
  @Query('status') status?: string
) {
  return this.callSessionService.getAstrologerCallSessions(
    req.user._id,
    {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    }
  );
}

/**
 * Get astrologer call session details
 * GET /calls/astrologer/sessions/:sessionId
 */
@Get('astrologer/sessions/:sessionId')
async getAstrologerCallSessionDetails(
  @Param('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  return this.callSessionService.getAstrologerCallSessionDetails(sessionId, req.user._id);
}


  // ===== CONTINUE CALL =====
  @Post('sessions/:sessionId/continue')
  async continueCall(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.callSessionService.continueCall(sessionId, req.user._id);
  }

  // ===== CANCEL CALL =====
  @Post('sessions/:sessionId/cancel')
  async cancelCall(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Body('reason') reason: string
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Cancellation reason must be at least 5 characters');
    }

   const result = await this.callGateway.cancelCallRequest(
      sessionId,
      req.user._id,
      reason || 'user_cancelled'
    );
    return {
      success: true,
      message: 'Call cancelled successfully',
      data: result // Note: cancelCallRequest returns { success: true, message: ... } usually
    };
  }

  // ===== GET CALL SESSION DETAILS =====
  @Get('sessions/:sessionId')
  async getSessionDetails(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Verify user has access to this session
    if (session.userId.toString() !== req.user._id && session.astrologerId.toString() !== req.user._id) {
      throw new BadRequestException('You do not have access to this session');
    }

    return {
      success: true,
      data: {
        sessionId: session.sessionId,
        orderId: session.orderId,
        callType: session.callType,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        billedMinutes: session.billedMinutes,
        totalAmount: session.totalAmount,
        ratePerMinute: session.ratePerMinute,
        recordingUrl: session.recordingUrl,
        recordingType: session.recordingType,
        recordingDuration: session.recordingDuration,
        userStatus: session.userStatus,
        astrologerStatus: session.astrologerStatus,
        sessionHistory: session.sessionHistory,
        totalPreviouslySpent: session.totalAmount,
        isPaid: session.isPaid
      }
    };
  }

  // ===== GET TIMER STATUS =====
  @Get('sessions/:sessionId/timer')
  async getTimerStatus(
    @Param('sessionId') sessionId: string
  ) {
    const session = await this.callSessionService.getSession(sessionId);
    
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

  // ===== GET RECORDING =====
  @Get('sessions/:sessionId/recording')
  async getRecording(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Verify access
    if (session.userId.toString() !== req.user._id && session.astrologerId.toString() !== req.user._id) {
      throw new BadRequestException('You do not have access to this recording');
    }

    if (!session.hasRecording || !session.recordingUrl) {
      return {
        success: false,
        message: 'No recording available for this call'
      };
    }

    return {
      success: true,
      data: {
        recordingUrl: session.recordingUrl,
        recordingS3Key: session.recordingS3Key,
        recordingType: session.recordingType,
        recordingDuration: session.recordingDuration,
        recordingStartedAt: session.recordingStartedAt,
        recordingEndedAt: session.recordingEndedAt
      }
    };
  }

  // ===== ADD CALL RATING/REVIEW =====
  @Post('sessions/:sessionId/review')
  async addReview(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) reviewData: {
      rating: number;
      review?: string;
    }
  ) {
    if (reviewData.rating < 1 || reviewData.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId.toString() !== req.user._id) {
      throw new BadRequestException('Only call initiator can review');
    }

    if (session.status !== 'ended') {
      throw new BadRequestException('Can only review completed calls');
    }

    // Update session with review
    session.rating = reviewData.rating;
    session.review = reviewData.review;
    session.reviewSubmitted = true;
    session.reviewSubmittedAt = new Date();
    await session.save();

    return {
      success: true,
      message: 'Review submitted successfully'
    };
  }

  // ===== REQUEST REFUND =====
  @Post('sessions/:sessionId/refund/request')
  async requestRefund(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Body('reason') reason: string
  ) {
    if (!reason || reason.trim().length < 20) {
      throw new BadRequestException('Refund reason must be at least 20 characters');
    }

    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId.toString() !== req.user._id) {
      throw new BadRequestException('Only call initiator can request refund');
    }

    if (session.status !== 'ended') {
      throw new BadRequestException('Can only request refund for completed calls');
    }

    if (session.refundRequest) {
      throw new BadRequestException('Refund request already exists for this call');
    }

    // Create refund request
    session.refundRequest = {
      requestedAt: new Date(),
      requestedBy: session.userId,
      reason,
      status: 'pending',
      refundPercentage: 100,
      refundAmount: session.totalAmount
    };

    await session.save();

    return {
      success: true,
      message: 'Refund request submitted',
      data: {
        sessionId,
        refundAmount: session.totalAmount,
        status: 'pending'
      }
    };
  }

  // ===== GET REFUND STATUS =====
  @Get('sessions/:sessionId/refund/status')
  async getRefundStatus(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId.toString() !== req.user._id) {
      throw new BadRequestException('You do not have access to this information');
    }

    if (!session.refundRequest) {
      return {
        success: false,
        message: 'No refund request for this call'
      };
    }

    return {
      success: true,
      data: {
        refundRequest: session.refundRequest,
        sessionId
      }
    };
  }

  // ===== DOWNLOAD RECORDING =====
  @Post('sessions/:sessionId/recording/download')
  async downloadRecording(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const session = await this.callSessionService.getSession(sessionId);
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Verify access
    if (session.userId.toString() !== req.user._id && session.astrologerId.toString() !== req.user._id) {
      throw new BadRequestException('You do not have access to this recording');
    }

    if (!session.hasRecording || !session.recordingUrl) {
      throw new NotFoundException('No recording available');
    }

    // TODO: Generate presigned S3 URL for download
    return {
      success: true,
      data: {
        downloadUrl: session.recordingUrl,
        fileName: `call_${sessionId}.${session.recordingType === 'video' ? 'mp4' : 'mp3'}`,
        size: session.recordingDuration // Approximate
      }
    };
  }

  // ===== GET REAL-TIME BILLING =====
@Get('sessions/:sessionId/billing/realtime')
async getRealTimeBilling(
  @Param('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  const session = await this.callSessionService.getSession(sessionId);
  if (!session) {
    throw new NotFoundException('Session not found');
  }

  if (session.userId.toString() !== req.user._id) {
    throw new BadRequestException('You do not have access to this information');
  }

  return this.callBillingService.calculateRealTimeBilling(sessionId);
}

// ===== GET BILLING SUMMARY =====
@Get('sessions/:sessionId/billing/summary')
async getBillingSummary(
  @Param('sessionId') sessionId: string,
  @Req() req: AuthenticatedRequest
) {
  const session = await this.callSessionService.getSession(sessionId);
  if (!session) {
    throw new NotFoundException('Session not found');
  }

  if (session.userId.toString() !== req.user._id && session.astrologerId.toString() !== req.user._id) {
    throw new BadRequestException('You do not have access to this information');
  }

  return this.callBillingService.getBillingSummary(sessionId);
}
}
