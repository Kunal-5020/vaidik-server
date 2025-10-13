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
import { WalletService } from '../services/wallet.service';
import { RechargeWalletDto } from '../dto/recharge-wallet.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  // Create recharge transaction
  @Post('recharge')
  async rechargeWallet(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) rechargeDto: RechargeWalletDto
  ) {
    return this.walletService.createRechargeTransaction(
      req.user._id,
      rechargeDto.amount,
      rechargeDto.paymentGateway
    );
  }

  // Verify payment
  @Post('verify-payment')
  async verifyPayment(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) verifyDto: VerifyPaymentDto
  ) {
    return this.walletService.verifyPayment(
      verifyDto.transactionId,
      verifyDto.paymentId,
      verifyDto.status
    );
  }

  // Get wallet transactions
  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    return this.walletService.getUserTransactions(
      req.user._id,
      page,
      limit,
      { type, status }
    );
  }

  // Get transaction details
  @Get('transactions/:transactionId')
  async getTransactionDetails(
    @Param('transactionId') transactionId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.walletService.getTransactionDetails(transactionId, req.user._id);
  }

  // Get wallet statistics
  @Get('stats')
  async getWalletStats(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletStats(req.user._id);
  }
  
}
