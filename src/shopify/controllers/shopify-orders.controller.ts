import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  Logger,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ShopifyService } from '../services/shopify.service';
import { ShopifyOrdersService } from '../services/shopify-orders.service';
import { SyncShopifyOrdersDto } from '../dto/sync-orders.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('shopify')
@UseGuards(JwtAuthGuard)
export class ShopifyOrdersController {
  private readonly logger = new Logger(ShopifyOrdersController.name);

  constructor(
    private shopifyService: ShopifyService,
    private shopifyOrdersService: ShopifyOrdersService,
  ) {}

  /**
   * POST /api/v1/shopify/sync-orders
   * Sync Shopify orders for user by phone number
   */
  @Post('sync-orders')
  async syncOrders(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: SyncShopifyOrdersDto,
  ) {
    this.logger.log(`Syncing orders for user: ${req.user._id}`);
    return this.shopifyOrdersService.syncUserOrders(req.user._id, dto);
  }

  /**
   * GET /api/v1/shopify/orders
   * Get user's synced Shopify orders
   */
  @Get('orders')
  async getUserOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    this.logger.log(`Fetching orders for user: ${req.user._id}`);
    return this.shopifyOrdersService.getUserOrders(req.user._id, page, limit);
  }

  /**
   * GET /api/v1/shopify/orders/:orderId
   * Get single order details
   */
  @Get('orders/:orderId')
  async getOrderDetails(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shopifyOrdersService.getOrderDetails(orderId, req.user._id);
  }
}
