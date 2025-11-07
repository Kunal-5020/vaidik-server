// src/orders/controllers/orders.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
  BadRequestException
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrdersService } from '../services/orders.service';
import { OrderPaymentService } from '../services/order-payment.service';
import { AddReviewDto } from '../dto/add-review.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { RequestRefundDto } from '../dto/request-refund.dto';
import { ExtendSessionDto } from '../dto/extend-session.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; role?: string };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService
  ) {}

  // ===== STATISTICS =====

  @Get('stats/summary')
  async getOrderStats(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getUserOrderStats(req.user._id);
  }

  // ===== GET ORDERS =====

  @Get()
  async getOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    const safeLimit = Math.min(limit, 100);

    return this.ordersService.getUserOrders(
      req.user._id,
      page,
      safeLimit,
      { type, status }
    );
  }

  // ===== GET SINGLE ORDER =====

  @Get(':orderId')
  async getOrderDetails(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getOrderDetails(orderId, req.user._id);
  }

  // ===== GET CONSULTATION SPACE (All sessions in order) =====

  @Get(':orderId/consultation-space')
  async getConsultationSpace(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getConsultationSpace(orderId, req.user._id);
  }

  // ===== GET RECORDING =====

  @Get(':orderId/recording')
  async getOrderRecording(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getOrderRecording(orderId, req.user._id);
  }

  // ===== ADD REVIEW =====

  @Post(':orderId/review')
  async addReview(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) reviewDto: AddReviewDto
  ) {
    return this.ordersService.addReview(
      orderId,
      req.user._id,
      reviewDto.rating,
      reviewDto.review
    );
  }

  // ===== CANCEL ORDER =====

  @Patch(':orderId/cancel')
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) cancelDto: CancelOrderDto
  ) {
    return this.ordersService.cancelOrder(
      orderId,
      req.user._id,
      cancelDto.reason,
      'user'
    );
  }

  // ===== REQUEST REFUND =====

  @Post(':orderId/refund/request')
  async requestRefund(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) refundDto: RequestRefundDto
  ) {
    return this.ordersService.requestRefund(
      orderId,
      req.user._id,
      refundDto.reason
    );
  }

  // ===== GET REFUND STATUS =====

  @Get(':orderId/refund/status')
  async getRefundStatus(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getRefundStatus(orderId, req.user._id);
  }

  // ===== EXTEND SESSION (Continue consultation) =====

  @Post(':orderId/extend')
  async extendSession(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) extendDto: ExtendSessionDto
  ) {
    return this.ordersService.continueConsultation(orderId, req.user._id);
  }

  // ===== CALCULATE MAX DURATION (For frontend) =====

  @Get(':orderId/max-duration')
  async getMaxDuration(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const order = await this.ordersService.getOrderDetails(orderId, req.user._id);
    const maxDurationInfo = await this.orderPaymentService.calculateMaxDuration(
      req.user._id,
      order.data.ratePerMinute
    );

    return {
      success: true,
      data: {
        orderId,
        maxDurationMinutes: maxDurationInfo.maxDurationMinutes,
        maxDurationSeconds: maxDurationInfo.maxDurationSeconds,
        walletBalance: maxDurationInfo.walletBalance,
        ratePerMinute: order.data.ratePerMinute
      }
    };
  }
}
