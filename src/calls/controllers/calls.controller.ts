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
import { CallSessionService } from '../services/call-session.service';
import { EndCallDto } from '../dto/end-call.dto';
import { GenerateTokenDto } from '../dto/generate-token.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private callSessionService: CallSessionService) {}

  // Get active call sessions
  @Get('sessions/active')
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const sessions = await this.callSessionService.getUserActiveSessions(req.user._id);
    return {
      success: true,
      data: sessions
    };
  }

  // Get call session details
  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.callSessionService.getSession(sessionId);
    return {
      success: true,
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
}
