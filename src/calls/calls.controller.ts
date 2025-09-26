import { 
  Controller, 
  Get, 
  Post, 
  Put, 
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
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { JoinCallDto } from './dto/join-call.dto';
import { EndCallDto } from './dto/end-call.dto';
import { UserDocument } from '../users/schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  // Initiate a new call
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateCall(
    @Req() req: AuthenticatedRequest,
    @Body() initiateCallDto: InitiateCallDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.callsService.initiateCall(userId, initiateCallDto);
  }

  // Join an existing call
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async joinCall(
    @Req() req: AuthenticatedRequest,
    @Body() joinCallDto: JoinCallDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.callsService.joinCall(userId, joinCallDto);
  }

  // End a call
  @Put('end')
  @HttpCode(HttpStatus.OK)
  async endCall(
    @Req() req: AuthenticatedRequest,
    @Body() endCallDto: EndCallDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.callsService.endCall(userId, endCallDto);
  }

  // Get call history
  @Get('history')
  async getCallHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    const userId = (req.user._id as any).toString();
    return this.callsService.getCallHistory(userId, page, limit);
  }

  // Get active call
  @Get('active')
  async getActiveCall(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    return this.callsService.getActiveCall(userId);
  }

  // Get call details by ID
  @Get(':callId')
  async getCallDetails(
    @Param('callId') callId: string,
    @Req() req: AuthenticatedRequest
  ) {
    // This would require a new method in CallsService
    const userId = (req.user._id as any).toString();
    // Implementation would check if user has access to this call
    return {
      success: true,
      message: 'Call details retrieved',
      data: { callId, userId } // Placeholder
    };
  }

  // Renew Agora token
  @Post(':callId/renew-token')
  @HttpCode(HttpStatus.OK)
  async renewToken(
    @Param('callId') callId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = (req.user._id as any).toString();
    return this.callsService.renewToken(callId, userId);
  }

  // Get Agora configuration
  @Get('config/agora')
  getAgoraConfig() {
    return this.callsService.getAgoraConfig();
  }

  // Get call statistics (for admin or astrologer dashboard)
  @Get('stats/summary')
  async getCallStats(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    
    // This would require implementation in CallsService
    return {
      success: true,
      data: {
        totalCalls: 0,
        totalMinutes: 0,
        totalEarnings: 0,
        averageCallDuration: 0,
        callTypes: {
          audio: 0,
          video: 0
        }
      }
    };
  }

  // Report call quality issues
  @Post(':callId/report-issue')
  @HttpCode(HttpStatus.OK)
  async reportCallIssue(
    @Param('callId') callId: string,
    @Req() req: AuthenticatedRequest,
    @Body() issueData: {
      issueType: 'audio' | 'video' | 'connection' | 'billing';
      description: string;
      severity: 'low' | 'medium' | 'high';
    }
  ) {
    const userId = (req.user._id as any).toString();
    
    // Log the issue for support team
    console.log(`🚨 Call issue reported for ${callId} by ${userId}:`, issueData);
    
    return {
      success: true,
      message: 'Issue reported successfully. Our support team will investigate.',
      data: {
        reportId: `report_${callId}_${Date.now()}`,
        callId,
        status: 'received'
      }
    };
  }
}
