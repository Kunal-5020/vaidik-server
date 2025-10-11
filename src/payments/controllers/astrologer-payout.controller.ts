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
import { PayoutService } from '../services/payout.service';
import { RequestPayoutDto } from '../dto/request-payout.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/payouts')
@UseGuards(JwtAuthGuard)
export class AstrologerPayoutController {
  constructor(private payoutService: PayoutService) {}

  // Request payout
  @Post()
  async requestPayout(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) requestDto: RequestPayoutDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.payoutService.requestPayout(astrologerId, requestDto);
  }

  // Get payout requests
  @Get()
  async getPayouts(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.payoutService.getAstrologerPayouts(
      astrologerId,
      page,
      limit,
      status
    );
  }

  // Get payout details
  @Get(':payoutId')
  async getPayoutDetails(
    @Param('payoutId') payoutId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.payoutService.getPayoutDetails(payoutId, astrologerId);
  }

  // Get payout statistics
  @Get('stats/summary')
  async getPayoutStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.payoutService.getPayoutStats(astrologerId);
  }
}
