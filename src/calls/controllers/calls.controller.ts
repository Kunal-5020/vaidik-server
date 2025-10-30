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
import { EndCallDto } from '../dto/end-call.dto';
import { GenerateTokenDto } from '../dto/generate-token.dto';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { AstrologersService } from '../../astrologers/services/astrologers.service'; // ✅ Need this

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(
    private callSessionService: CallSessionService,
    private astrologersService: AstrologersService // ✅ ADD
  ) {}

  // ✅ FIXED ORDER: Static routes first

  // Get call history
  @Get('history')
  async getCallHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const result = await this.callSessionService.getCallHistory(req.user._id, page, limit);
    return {
      success: true,
      data: result
    };
  }

  // Get active call sessions
  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.callSessionService.getUserActiveSessions(req.user._id);
    return {
      success: true,
      data: sessions
    };
  }

  // ✅ NEW: Initiate call
  @Post('initiate')
  async initiateCall(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) initiateDto: InitiateCallDto
  ) {
    // Get astrologer details
    const astrologer = await this.astrologersService.getAstrologerDetails(initiateDto.astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (!astrologer.isOnline) {
      throw new BadRequestException('Astrologer is currently offline');
    }

    // Create session
    const session = await this.callSessionService.createSession({
      userId: req.user._id,
      astrologerId: initiateDto.astrologerId,
      astrologerName: astrologer.name,
      callType: initiateDto.callType,
      ratePerMinute: astrologer.pricing?.callRate || 0
    });

    return {
      success: true,
      message: 'Call session created',
      data: session
    };
  }

  // End call (REST API fallback)
  @Post('sessions/end')
  async endSession(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) endDto: EndCallDto
  ) {
    const session = await this.callSessionService.endSession(
      endDto.sessionId,
      req.user._id,
      endDto.reason || 'completed'
    );

    return {
      success: true,
      message: 'Call ended successfully',
      data: session
    };
  }

  // Regenerate Agora token
  @Post('sessions/regenerate-token')
  async regenerateToken(
    @Body(ValidationPipe) tokenDto: GenerateTokenDto
  ) {
    const token = await this.callSessionService.regenerateToken(tokenDto.sessionId);
    return {
      success: true,
      data: { token }
    };
  }

  // NOW dynamic routes

  // Get call session details
  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.callSessionService.getSession(sessionId);
    return {
      success: true,
      data: session
    };
  }

  // ✅ NEW: Get call recording
  @Get('sessions/:sessionId/recording')
  async getRecording(
    @Param('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.callSessionService.getRecording(sessionId, req.user._id);
  }
}
