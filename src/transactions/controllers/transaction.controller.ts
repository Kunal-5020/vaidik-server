// src/transactions/controllers/transaction.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TransactionService } from '../services/transaction.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  /**
   * Get transactions
   * GET /astrologer/transactions?page=1&limit=20&type=credit
   */
  @Get()
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: 'credit' | 'debit',
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.transactionService.getAstrologerTransactions(
      astrologerId,
      page,
      limit,
      type,
    );
  }

  /**
   * Get transaction details
   * GET /astrologer/transactions/:transactionId
   */
  @Get(':transactionId')
  async getTransactionDetails(
    @Param('transactionId') transactionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.transactionService.getTransactionDetails(
      transactionId,
      astrologerId,
    );
  }

  /**
   * Get transaction summary
   * GET /astrologer/transactions/summary?period=month
   */
  @Get('summary/stats')
  async getTransactionSummary(
    @Req() req: AuthenticatedRequest,
    @Query('period') period: 'week' | 'month' | 'year' = 'month',
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.transactionService.getTransactionSummary(astrologerId, period);
  }
}
