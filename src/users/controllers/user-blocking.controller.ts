import { 
  Controller, 
  Post, 
  Delete, 
  Get, 
  Body, 
  Param, 
  UseGuards, 
  Req,
  BadRequestException
} from '@nestjs/common';
import { UserBlockingService } from '../services/user-blocking.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Types } from 'mongoose';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}

@Controller('users/blocking')
@UseGuards(JwtAuthGuard)
export class UserBlockingController {
  constructor(private readonly blockingService: UserBlockingService) {}

  // Block astrologer
  @Post('block')
  async blockAstrologer(
    @Req() req: AuthenticatedRequest,
    @Body() body: { astrologerId: any; reason: string },
  ) {
    // FIX: Convert astrologerId to string if it's a Buffer
    let astrologerIdString: string;
    
    if (!body.astrologerId) {
      throw new BadRequestException('Astrologer ID is required');
    }

    // Handle different input formats
    if (Buffer.isBuffer(body.astrologerId)) {
      astrologerIdString = body.astrologerId.toString('hex');
    } else if (typeof body.astrologerId === 'object' && body.astrologerId.buffer) {
      // Handle Buffer object format: { buffer: { type: 'Buffer', data: [...] } }
      const bufferData = Buffer.from(body.astrologerId.buffer.data);
      astrologerIdString = bufferData.toString('hex');
    } else if (typeof body.astrologerId === 'string') {
      astrologerIdString = body.astrologerId;
    } else {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(astrologerIdString)) {
      throw new BadRequestException('Invalid astrologer ID');
    }

    if (!body.reason) {
      throw new BadRequestException('Reason is required');
    }

    return this.blockingService.blockAstrologer(
      new Types.ObjectId(req.user.userId),
      astrologerIdString,
      body.reason,
    );
  }

  // Unblock astrologer
  @Delete('unblock/:astrologerId')
  async unblockAstrologer(
    @Req() req: AuthenticatedRequest,
    @Param('astrologerId') astrologerId: string,
  ) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID');
    }

    return this.blockingService.unblockAstrologer(
      new Types.ObjectId(req.user.userId),
      astrologerId,
    );
  }

  // Get blocked list
  @Get('list')
  async getBlockedList(@Req() req: AuthenticatedRequest) {
    return this.blockingService.getBlockedAstrologers(
      new Types.ObjectId(req.user.userId),
    );
  }

  // Check if specific astrologer is blocked
  @Get('check/:astrologerId')
  async checkBlocked(
    @Req() req: AuthenticatedRequest,
    @Param('astrologerId') astrologerId: string,
  ) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID');
    }

    const isBlocked = await this.blockingService.isAstrologerBlocked(
      new Types.ObjectId(req.user.userId),
      astrologerId,
    );

    return {
      success: true,
      isBlocked,
    };
  }
}
