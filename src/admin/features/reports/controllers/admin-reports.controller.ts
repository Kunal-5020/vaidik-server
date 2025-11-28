import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminReportsService } from '../services/admin-reports.service';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminReportsController {
  constructor(private reportsService: AdminReportsService) {}

  /**
   * GET /admin/reports/revenue
   * Get revenue report
   */
  @Get('revenue')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getRevenueReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.reportsService.getRevenueReport(startDate, endDate, groupBy);
  }

  /**
   * GET /admin/reports/users
   * Get user growth report
   */
  @Get('users')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getUserGrowthReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getUserGrowthReport(startDate, endDate);
  }

  /**
   * GET /admin/reports/astrologers
   * Get astrologer performance report
   */
  @Get('astrologers')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getAstrologerPerformanceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.reportsService.getAstrologerPerformanceReport(startDate, endDate, limit);
  }

  /**
   * GET /admin/reports/orders
   * Get orders summary report
   */
  @Get('orders')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getOrdersReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getOrdersReport(startDate, endDate);
  }

  /**
   * GET /admin/reports/payments
   * Get payments summary report
   */
  @Get('payments')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getPaymentsReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getPaymentsReport(startDate, endDate);
  }

  /**
   * GET /admin/reports/export/revenue
   * Export revenue report as CSV
   */
  @Get('export/revenue')
  @RequirePermissions(Permissions.REPORTS_EXPORT)
  async exportRevenueReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const csv = await this.reportsService.exportRevenueReport(startDate, endDate);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${Date.now()}.csv"`);
    res.send(csv);
  }

  /**
   * GET /admin/reports/export/users
   * Export users report as CSV
   */
  @Get('export/users')
  @RequirePermissions(Permissions.REPORTS_EXPORT)
  async exportUsersReport(
    @Query('status') status?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.reportsService.exportUsersReport(status);
    
    if (res) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="users-report-${Date.now()}.csv"`);
      res.send(csv);
    }
  }

  /**
   * GET /admin/reports/export/astrologers
   * Export astrologers report as CSV
   */
  @Get('export/astrologers')
  @RequirePermissions(Permissions.REPORTS_EXPORT)
  async exportAstrologersReport(@Res() res: Response) {
    const csv = await this.reportsService.exportAstrologersReport();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="astrologers-report-${Date.now()}.csv"`);
    res.send(csv);
  }

  /**
   * GET /admin/reports/dashboard-summary
   * Get comprehensive dashboard summary
   */
  @Get('dashboard-summary')
  @RequirePermissions(Permissions.REPORTS_VIEW)
  async getDashboardSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getDashboardSummary(startDate, endDate);
  }
}
