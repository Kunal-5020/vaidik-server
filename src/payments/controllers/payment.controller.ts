// src/payments/controllers/payment.controller.ts
import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  UseGuards, 
  Req,
  ValidationPipe 
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PaymentService } from '../services/payment.service';
import { RazorpayService } from '../services/razorpay.service';
import { CreateOrderDto } from '../dto/orders/create-order.dto';
import { VerifyPaymentDto } from '../dto/verification/verify-payment.dto';
import { TransactionQueryDto } from '../dto/transactions/transaction-query.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private razorpayService: RazorpayService,
  ) {}

  @Post('create-order')
  async createOrder(
    @Body(ValidationPipe) createOrderDto: CreateOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.createOrder(req.user.userId, createOrderDto);
  }

  @Post('verify')
  async verifyPayment(
    @Body(ValidationPipe) verifyPaymentDto: VerifyPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.verifyPayment(req.user.userId, verifyPaymentDto);
  }

  @Get('orders')
  async getPaymentOrders(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.getPaymentOrders(
      req.user.userId, 
      Number(page), 
      Number(limit)
    );
  }

  @Get('transactions')
  async getWalletTransactions(
    @Query(ValidationPipe) queryDto: TransactionQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.getWalletTransactions(req.user.userId, queryDto);
  }

  @Get('wallet/summary')
  async getWalletSummary(@Req() req: AuthenticatedRequest) {
    return this.paymentService.getWalletSummary(req.user.userId);
  }

  @Get('config')
  async getRazorpayConfig() {
    const config = this.razorpayService.getClientConfig();
    return {
      success: true,
      data: config,
    };
  }

  @Get('health')
  async healthCheck() {
    return this.razorpayService.healthCheck();
  }
}
