// src/admin/features/monitoring/controllers/admin-monitoring.controller.ts
import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminMonitoringService } from '../services/admin-monitoring.service';

@Controller('admin/monitoring')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminMonitoringController {
  private readonly logger = new Logger(AdminMonitoringController.name);

  constructor(private monitoringService: AdminMonitoringService) {}

  // ===== SYSTEM HEALTH =====

  /**
   * GET /admin/monitoring/health
   * Get system health status
   */
  @Get('health')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getSystemHealth() {
    return this.monitoringService.getSystemHealth();
  }

  /**
   * GET /admin/monitoring/dashboard
   * Get monitoring dashboard data
   */
  @Get('dashboard')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getMonitoringDashboard() {
    return this.monitoringService.getMonitoringDashboard();
  }

  // ===== SHOPIFY ORDERS =====

  /**
   * GET /admin/monitoring/shopify-orders/stats
   * Get Shopify orders statistics
   */
  @Get('shopify-orders/stats')
  @RequirePermissions(Permissions.MONITORING_SHOPIFY)
  async getShopifyOrdersStats() {
    return this.monitoringService.getShopifyOrdersStats();
  }

  /**
   * GET /admin/monitoring/shopify-orders
   * Get all Shopify orders
   */
  @Get('shopify-orders')
  @RequirePermissions(Permissions.MONITORING_SHOPIFY)
  async getAllShopifyOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.monitoringService.getAllShopifyOrders(page, Math.min(limit, 100), status, search);
  }

  /**
   * GET /admin/monitoring/shopify-orders/:orderId
   * Get Shopify order details
   */
  @Get('shopify-orders/:orderId')
  @RequirePermissions(Permissions.MONITORING_SHOPIFY)
  async getShopifyOrderDetails(@Param('orderId') orderId: string) {
    return this.monitoringService.getShopifyOrderDetails(orderId);
  }

  // ===== REMEDIES =====

  /**
   * GET /admin/monitoring/remedies/stats
   * Get remedies statistics
   */
  @Get('remedies/stats')
  @RequirePermissions(Permissions.MONITORING_REMEDIES)
  async getRemediesStats() {
    return this.monitoringService.getRemediesStats();
  }

  /**
   * GET /admin/monitoring/remedies
   * Get all remedies
   */
  @Get('remedies')
  @RequirePermissions(Permissions.MONITORING_REMEDIES)
  async getAllRemedies(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.monitoringService.getAllRemedies(page, Math.min(limit, 100), status, category);
  }

  /**
   * GET /admin/monitoring/remedies/:remedyId
   * Get remedy details
   */
  @Get('remedies/:remedyId')
  @RequirePermissions(Permissions.MONITORING_REMEDIES)
  async getRemedyDetails(@Param('remedyId') remedyId: string) {
    return this.monitoringService.getRemedyDetails(remedyId);
  }

  // ===== USER JOURNEY =====

  /**
   * GET /admin/monitoring/users/:userId/journey
   * Get user journey (all activities)
   */
  @Get('users/:userId/journey')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getUserJourney(@Param('userId') userId: string) {
    return this.monitoringService.getUserJourney(userId);
  }

  /**
   * GET /admin/monitoring/users/:userId/timeline
   * Get user activity timeline
   */
  @Get('users/:userId/timeline')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getUserTimeline(
    @Param('userId') userId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.monitoringService.getUserTimeline(userId, days);
  }

  // ===== ASTROLOGER PERFORMANCE =====

  /**
   * GET /admin/monitoring/astrologers/:astrologerId/activity
   * Get astrologer activity monitoring
   */
  @Get('astrologers/:astrologerId/activity')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getAstrologerActivity(
    @Param('astrologerId') astrologerId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.monitoringService.getAstrologerActivity(astrologerId, days);
  }

  // ===== SYSTEM METRICS =====

  /**
   * GET /admin/monitoring/metrics/realtime
   * Get real-time system metrics
   */
  @Get('metrics/realtime')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getRealtimeMetrics() {
    return this.monitoringService.getRealtimeMetrics();
  }

  /**
   * GET /admin/monitoring/metrics/errors
   * Get error logs and failed transactions
   */
  @Get('metrics/errors')
  @RequirePermissions(Permissions.MONITORING_VIEW)
  async getErrorLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.monitoringService.getErrorLogs(page, limit);
  }
}
