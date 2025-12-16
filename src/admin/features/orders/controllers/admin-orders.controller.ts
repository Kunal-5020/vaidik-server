// src/admin/features/orders/controllers/admin-orders.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';
import { CallSessionService } from '../../../../calls/services/call-session.service';
import { ChatSessionService } from '../../../../chat/services/chat-session.service';

import { AdminOrdersService } from '../services/admin-orders.service';
import { RefundOrderDto } from '../dto/refund-order.dto';
import { ProcessRefundDto } from '../dto/process-refund.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { OrderQueryDto } from '../dto/order-query.dto';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(
    private adminOrdersService: AdminOrdersService,
    private callSessionService: CallSessionService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  /**
   * GET /admin/orders
   * Get all orders with filters
   */
  @Get()
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getAllOrders(
    @Query(ValidationPipe) queryDto: OrderQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = {
      status: queryDto.status,
      type: queryDto.type,
      userId: queryDto.userId,
      astrologerId: queryDto.astrologerId,
      startDate: queryDto.startDate ? new Date(queryDto.startDate) : undefined,
      endDate: queryDto.endDate ? new Date(queryDto.endDate) : undefined,
    };

    return this.adminOrdersService.getAllOrders(page, limit, filters);
  }

  @Get('calls') // ✅ New dedicated endpoint
  async getAllCalls(@Query() query: any) {
    return this.adminOrdersService.getAllCalls(query);
  }

  @Get('chats') // ✅ New dedicated endpoint
  async getAllChats(@Query() query: any) {
    return this.adminOrdersService.getAllChats(query);
  }

  /**
   * GET /admin/orders/stats
   * Get order statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderStats() {
    return this.adminOrdersService.getOrderStats();
  }

  /**
   * GET /admin/orders/revenue
   * Get revenue statistics
   */
  @Get('revenue')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminOrdersService.getRevenueStats(startDate, endDate);
  }

  /**
   * GET /admin/orders/refunds/pending
   * Get pending refund requests
   */
  @Get('refunds/pending')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getPendingRefundRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminOrdersService.getPendingRefundRequests(page, limit);
  }

  /**
   * GET /admin/orders/refunds/all
   * Get all refund requests
   */
  @Get('refunds/all')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getAllRefundRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.adminOrdersService.getAllRefundRequests(page, limit, status);
  }

  /**
   * GET /admin/orders/refunds/stats
   * Get refund statistics
   */
  @Get('refunds/stats')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getRefundStats() {
    return this.adminOrdersService.getRefundStats();
  }

  // ✅ NEW: Endpoint to force end a call
  @Post('calls/:sessionId/end')
  async forceEndCall(@Param('sessionId') sessionId: string) {
    // We use the existing logic from CallSessionService which handles
    // Agora channel closing, status updates, and billing.
    const session = await this.callSessionService.endCall(sessionId, {
        endedBy: 'admin',
        reason: 'Force ended by admin'
    });

    if (!session) {
        throw new NotFoundException('Call session not found or already ended');
    }

    return {
        success: true,
        message: 'Call session force ended successfully',
        data: session
    };
  }

  // ✅ NEW: Endpoint to force end a chat
  @Post('chats/:sessionId/end')
  async forceEndChat(@Param('sessionId') sessionId: string) {
    const session = await this.chatSessionService.endSession(sessionId, 'admin', 'Force ended by admin');

    if (!session) {
        throw new NotFoundException('Chat session not found or already ended');
    }

    return {
        success: true,
        message: 'Chat session force ended successfully',
        data: session
    };
  }

  /**
   * GET /admin/orders/:orderId
   * Get order details
   */
  @Get(':orderId')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderDetails(@Param('orderId') orderId: string) {
    return this.adminOrdersService.getOrderDetails(orderId);
  }

  /**
   * PATCH /admin/orders/:orderId/cancel
   * Cancel order
   */
  @Patch(':orderId/cancel')
  @RequirePermissions(Permissions.ORDERS_CANCEL)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) cancelDto: CancelOrderDto,
  ) {
    return this.adminOrdersService.cancelOrder(orderId, admin._id, cancelDto.reason);
  }

  /**
   * POST /admin/orders/:orderId/refund
   * Process refund request
   */
  @Post(':orderId/refund')
  @RequirePermissions(Permissions.ORDERS_REFUND)
  async processRefundRequest(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) refundDto: ProcessRefundDto,
  ) {
    return this.adminOrdersService.processRefundRequest(orderId, admin._id, refundDto);
  }

  /**
   * POST /admin/orders/:orderId/refund/direct
   * Direct refund (legacy support)
   */
  @Post(':orderId/refund/direct')
  @RequirePermissions(Permissions.ORDERS_REFUND)
  async refundOrderDirect(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) refundDto: RefundOrderDto,
  ) {
    return this.adminOrdersService.refundOrderDirect(orderId, admin._id, refundDto);
  }
}
