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

  // ==================================================================
  // 1. SPECIFIC ROUTES (MUST BE DEFINED BEFORE :orderId)
  // ==================================================================

  // ===== STATISTICS (User) =====
  @Get('stats/summary')
  async getOrderStats(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getUserOrderStats(req.user._id);
  }

  // ===== ASTROLOGER ROUTES (Specific) =====
  // moved UP to prevent collision with :orderId
  
  /**
   * Get astrologer's orders
   * GET /orders/astrologer/my-orders
   */
  @Get('astrologer/my-orders')
  async getAstrologerOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: string,
    @Query('type') type?: 'chat' | 'call' | 'conversation'
  ) {
    return this.ordersService.getAstrologerOrders(
      req.user._id,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        type
      }
    );
  }

  /**
   * Get astrologer order details
   * GET /orders/astrologer/:orderId
   * Note: This is specific enough ('astrologer/' prefix) but still safer up here.
   */
  @Get('astrologer/:orderId')
  async getAstrologerOrderDetails(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getAstrologerOrderDetails(orderId, req.user._id);
  }

  // ===== CONVERSATION ROUTES (Specific) =====

  @Get('conversations')
  async getUserConversations(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.ordersService.getUserConversations(req.user._id, page, limit);
  }

  @Get('conversations/:orderId/stats')
  async getConversationStats(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getConversationStats(orderId, req.user._id);
  }

  // ==================================================================
  // 2. GENERIC ROUTES
  // ==================================================================

  // ===== GET USER ORDERS (Search) =====
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

  // ==================================================================
  // 3. PARAMETERIZED ROUTES (:orderId)
  // (Must be LAST to avoid intercepting specific paths)
  // ==================================================================

  // ===== GET SINGLE ORDER =====
  @Get(':orderId')
  async getOrderDetails(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getOrderDetails(orderId, req.user._id);
  }

  // ===== GET CONSULTATION SPACE =====
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

  // ===== REVIEW STATUS =====
  @Get(':orderId/review-status')
  async getReviewStatus(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const order = await this.ordersService.getOrderDetails(orderId, req.user._id);
    
    return {
      success: true,
      data: {
        orderId,
        reviewGiven: order.data.reviewGiven,
        reviewGivenAt: order.data.reviewGivenAt,
        canReview: order.data.status === 'completed' && !order.data.reviewGiven
      }
    };
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

  // ===== EXTEND SESSION =====
  @Post(':orderId/extend')
  async extendSession(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) extendDto: ExtendSessionDto
  ) {
    return this.ordersService.continueConsultation(orderId, req.user._id);
  }

  // ===== CALCULATE MAX DURATION =====
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