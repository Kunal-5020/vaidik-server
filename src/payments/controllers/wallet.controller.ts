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

  // Get wallet statistics
  @Get('stats')
  async getWalletStats(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletStats(req.user._id);
  }

  // Get wallet with hold status
  @Get('stats/with-hold')
  async getWalletWithHold(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletWithHold(req.user._id);
  }

  // Get payment logs
  @Get('payment-logs')
  async getPaymentLogs(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.walletService.getPaymentLogs(
      req.user._id,
      page,
      limit,
      status,
    );
  }

  // ✅ FIXED: Create recharge transaction (Razorpay only)
  @Post('recharge')
  async rechargeWallet(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) rechargeDto: RechargeWalletDto,
  ) {
    return this.walletService.createRechargeTransaction(
      req.user._id,
      rechargeDto.amount,
      rechargeDto.currency || 'INR', // ✅ Removed paymentGateway reference
    );
  }

  // Verify payment
  @Post('verify-payment')
  async verifyPayment(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) verifyDto: VerifyPaymentDto,
  ) {
    return this.walletService.verifyPayment(
      verifyDto.transactionId,
      verifyDto.paymentId,
      verifyDto.status,
    );
  }

  // Get wallet transactions
  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.walletService.getUserTransactions(req.user._id, page, limit, {
      type,
      status,
    });
  }

  // Get transaction details
  @Get('transactions/:transactionId')
  async getTransactionDetails(
    @Param('transactionId') transactionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.walletService.getTransactionDetails(
      transactionId,
      req.user._id,
    );
  }
}
