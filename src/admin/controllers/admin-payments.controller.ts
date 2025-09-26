// src/admin/controllers/admin-payments.controller.ts (New Controller)
import { 
  Controller, 
  Get, 
  Post,
  Query,
  Body,
  UseGuards,
  ValidationPipe 
} from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminPermission } from '../enums/admin-role.enum';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminDocument } from '../schemas/admin.schema';
import type { TransactionQueryDto } from '../dto/payment/transaction-query.dto';
import type { ProcessRefundDto } from '../dto/payment/process-refund.dto';

@Controller('admin/payments')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminPaymentsController {
  @Get('transactions')
  @RequirePermissions(AdminPermission.VIEW_TRANSACTIONS)
  async getTransactions(
    @Query(ValidationPipe) query: TransactionQueryDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: {
        transactions: [],
        pagination: {
          page: query.page || 1,
          limit: query.limit || 20,
          total: 0,
          pages: 0,
        },
      },
      message: 'Transactions will be available when payment system is implemented',
    };
  }

  @Post('refund')
  @RequirePermissions(AdminPermission.PROCESS_REFUNDS)
  async processRefund(
    @Body(ValidationPipe) refundDto: ProcessRefundDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: false,
      message: 'Refund processing will be available when payment system is implemented',
    };
  }
}
