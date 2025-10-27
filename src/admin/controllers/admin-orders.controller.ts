// src/admin/controllers/admin-orders.controller.ts

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
  BadRequestException 
} from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { Permissions } from '../constants/permissions';
import { AdminOrdersService } from '../services/admin-orders.service';
import { RefundOrderDto } from '../dto/refund-order.dto';
import { ProcessRefundDto } from '../dto/process-refund.dto';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(private adminOrdersService: AdminOrdersService) {}

  // ===== ORDER MANAGEMENT =====

  @Get()
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getAllOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('astrologerId') astrologerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminOrdersService.getAllOrders(page, limit, {
      status,
      type,
      userId,
      astrologerId,
      startDate,
      endDate
    });
  }

  @Get('stats')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderStats() {
    return this.adminOrdersService.getOrderStats();
  }

  @Get('stats/revenue')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminOrdersService.getRevenueStats(startDate, endDate);
  }

  @Get(':orderId')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderDetails(@Param('orderId') orderId: string) {
    return this.adminOrdersService.getOrderDetails(orderId);
  }

  @Patch(':orderId/cancel')
  @RequirePermissions(Permissions.ORDERS_CANCEL)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason: string
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Cancellation reason must be at least 10 characters');
    }
    return this.adminOrdersService.cancelOrder(orderId, admin._id, reason);
  }

  // ===== REFUND MANAGEMENT =====

  @Get('refunds/pending')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getPendingRefunds(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.adminOrdersService.getPendingRefundRequests(page, limit);
  }

  @Get('refunds/all')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getAllRefunds(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: 'pending' | 'approved' | 'rejected'
  ) {
    return this.adminOrdersService.getAllRefundRequests(page, limit, status);
  }

  @Get('refunds/stats')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getRefundStats() {
    return this.adminOrdersService.getRefundStats();
  }

  @Patch('refunds/:orderId/process')
  @RequirePermissions(Permissions.ORDERS_REFUND)
  async processRefund(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) processDto: ProcessRefundDto
  ) {
    if (processDto.action === 'reject' && !processDto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting refund');
    }

    if (processDto.action === 'approve' && processDto.refundPercentage) {
      if (processDto.refundPercentage < 1 || processDto.refundPercentage > 100) {
        throw new BadRequestException('Refund percentage must be between 1 and 100');
      }
    }

    return this.adminOrdersService.processRefundRequest(
      orderId,
      admin._id,
      processDto
    );
  }

  // ===== LEGACY: Direct Refund (for backward compatibility) =====
  @Post(':orderId/refund')
  @RequirePermissions(Permissions.ORDERS_REFUND)
  async refundOrderDirect(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) refundDto: RefundOrderDto
  ) {
    return this.adminOrdersService.refundOrderDirect(orderId, admin._id, refundDto);
  }
}
