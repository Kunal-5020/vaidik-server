import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminMonitoringService } from '../services/admin-monitoring.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string; role?: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private adminMonitoringService: AdminMonitoringService) {}

  // ============ SYSTEM HEALTH (FIRST - No params) ============

  /**
   * GET /api/v1/admin/health
   * Get system health and sync status
   */
  @Get('health')
  async getSystemHealth() {
    this.logger.log('Fetching system health');
    return this.adminMonitoringService.getSystemHealth();
  }

  // ============ SHOPIFY ORDERS ENDPOINTS ============

  /**
   * GET /api/v1/admin/shopify-orders/stats
   * Get Shopify orders statistics (MUST come before :orderId)
   */
  @Get('shopify-orders/stats')
  async getShopifyOrdersStats() {
    this.logger.log('Fetching Shopify orders statistics');
    return this.adminMonitoringService.getShopifyOrdersStats();
  }

  /**
   * GET /api/v1/admin/shopify-orders/search
   * Search Shopify orders (MUST come before :orderId)
   */
  @Get('shopify-orders/search')
  async searchShopifyOrders(
    @Query('query') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Searching Shopify orders: ${query}`);
    if (!query) {
      throw new Error('Query parameter is required');
    }
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.searchShopifyOrders(
      query,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/admin/shopify-orders/status/:status
   * Get Shopify orders by status (MUST come before generic :id route)
   */
  @Get('shopify-orders/status/:status')
  async getShopifyOrdersByStatus(
    @Param('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching Shopify orders by status: ${status}`);
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.getShopifyOrdersByStatus(
      status,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/admin/shopify-orders/:orderId
   * Get single Shopify order details (✅ NEW)
   */
  @Get('shopify-orders/:orderId')
  async getShopifyOrderDetails(@Param('orderId') orderId: string) {
    this.logger.log(`Fetching Shopify order details: ${orderId}`);
    return this.adminMonitoringService.getOrderDetails(orderId);
  }

  /**
   * GET /api/v1/admin/shopify-orders
   * Get all synced Shopify orders
   */
  @Get('shopify-orders')
  async getAllShopifyOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching all Shopify orders - page: ${page}`);
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.getAllShopifyOrders(page, safeLimit);
  }

  // ============ REMEDIES ENDPOINTS ============

  /**
   * GET /api/v1/admin/remedies/stats
   * Get remedies statistics (MUST come before :remedyId)
   */
  @Get('remedies/stats')
  async getRemediesStats() {
    this.logger.log('Fetching remedies statistics');
    return this.adminMonitoringService.getRemediesStats();
  }

  /**
   * GET /api/v1/admin/remedies/conversion-tracking
   * Get purchase conversion metrics (MUST come before :remedyId)
   */
  @Get('remedies/conversion-tracking')
  async getPurchaseConversionTracking() {
    this.logger.log('Fetching purchase conversion tracking');
    return this.adminMonitoringService.getPurchaseConversionTracking();
  }

  /**
   * GET /api/v1/admin/remedies/source/:source
   * Get remedies by source (MUST come before :remedyId)
   */
  @Get('remedies/source/:source')
  async getRemediesBySource(
    @Param('source') source: 'manual' | 'shopify_product',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching remedies by source: ${source}`);
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.getRemediesBySource(
      source,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/admin/remedies/status/:status
   * Get remedies by status (MUST come before :remedyId)
   */
  @Get('remedies/status/:status')
  async getRemediesByStatus(
    @Param('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching remedies by status: ${status}`);
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.getRemediesByStatus(
      status,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/admin/remedies/:remedyId
   * Get single remedy details (✅ NEW)
   */
  @Get('remedies/:remedyId')
  async getRemedyDetails(@Param('remedyId') remedyId: string) {
    this.logger.log(`Fetching remedy details: ${remedyId}`);
    return this.adminMonitoringService.getRemedyDetails(remedyId);
  }

  /**
   * GET /api/v1/admin/remedies
   * Get all remedies
   */
  @Get('remedies')
  async getAllRemedies(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching all remedies - page: ${page}`);
    const safeLimit = Math.min(limit, 100);
    return this.adminMonitoringService.getAllRemedies(page, safeLimit);
  }

  // ============ ASTROLOGER PERFORMANCE ============

  /**
   * GET /api/v1/admin/astrologers/:astrologerId/performance
   * Get astrologer performance metrics
   */
  @Get('astrologers/:astrologerId/performance')
  async getAstrologerPerformance(
    @Param('astrologerId') astrologerId: string,
  ) {
    this.logger.log(`Fetching performance for astrologer: ${astrologerId}`);
    return this.adminMonitoringService.getAstrologerPerformance(
      astrologerId,
    );
  }

  // ============ ORDER & REMEDY LINKING ============

  /**
   * GET /api/v1/admin/orders/:orderId/with-remedies
   * Get order with all suggested remedies
   */
  @Get('orders/:orderId/with-remedies')
  async getOrderWithRemedies(@Param('orderId') orderId: string) {
    this.logger.log(`Fetching order with remedies: ${orderId}`);
    return this.adminMonitoringService.getOrderWithRemedies(orderId);
  }

  // ============ USER JOURNEY ============

  /**
   * GET /api/v1/admin/users/:userId/journey
   * Get user's complete journey (orders -> remedies -> purchases)
   */
  @Get('users/:userId/journey')
  async getUserJourney(@Param('userId') userId: string) {
    this.logger.log(`Fetching user journey: ${userId}`);
    return this.adminMonitoringService.getUserJourney(userId);
  }
}
