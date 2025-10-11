import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, DefaultValuePipe, ParseIntPipe, ValidationPipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { Permissions } from '../constants/permissions';
import { AdminOrdersService } from '../services/admin-orders.service';
import { RefundOrderDto } from '../dto/refund-order.dto';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminOrdersController {
  constructor(private adminOrdersService: AdminOrdersService) {}

  @Get()
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getAllOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminOrdersService.getAllOrders(page, limit, { status, type, startDate, endDate });
  }

  @Get('stats')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderStats() {
    return this.adminOrdersService.getOrderStats();
  }

  @Get(':orderId')
  @RequirePermissions(Permissions.ORDERS_VIEW)
  async getOrderDetails(@Param('orderId') orderId: string) {
    return this.adminOrdersService.getOrderDetails(orderId);
  }

  @Post(':orderId/refund')
  @RequirePermissions(Permissions.ORDERS_REFUND)
  async refundOrder(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) refundDto: RefundOrderDto
  ) {
    return this.adminOrdersService.refundOrder(orderId, admin._id, refundDto);
  }

  @Patch(':orderId/cancel')
  @RequirePermissions(Permissions.ORDERS_CANCEL)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason: string
  ) {
    return this.adminOrdersService.cancelOrder(orderId, admin._id, reason);
  }
}
