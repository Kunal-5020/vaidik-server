import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
  Param,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RemediesService } from '../services/remedies.service';
import { SuggestManualRemedyDto } from '../dto/suggest-manual-remedy.dto';
import { SuggestProductRemedyDto } from '../dto/suggest-product-remedy.dto';
import { ShopifyOrdersService } from '../../shopify/services/shopify-orders.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string; name?: string };
}

@Controller('astrologer/remedies')
@UseGuards(JwtAuthGuard)
export class AstrologerRemediesController {
  private readonly logger = new Logger(AstrologerRemediesController.name);

  constructor(
    private remediesService: RemediesService,
    private shopifyOrdersService: ShopifyOrdersService,
  ) {}

  /**
   * POST /api/v1/astrologer/remedies/suggest-manual/:userId/:orderId
   * Suggest manual text remedy
   */
  @Post('suggest-manual/:userId/:orderId')
  async suggestManualRemedy(
    @Param('userId') userId: string,
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: SuggestManualRemedyDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    const astrologerName = req.user.name || 'Astrologer';

    this.logger.log(
      `${astrologerName} suggesting manual remedy to user ${userId}`,
    );

    return this.remediesService.suggestManualRemedy(
      astrologerId,
      astrologerName,
      orderId,
      userId,
      dto,
    );
  }

  /**
   * POST /api/v1/astrologer/remedies/suggest-product/:userId/:orderId
   * Suggest Shopify product as remedy
   */
  @Post('suggest-product/:userId/:orderId')
  async suggestProductRemedy(
    @Param('userId') userId: string,
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: SuggestProductRemedyDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    const astrologerName = req.user.name || 'Astrologer';

    this.logger.log(
      `${astrologerName} suggesting Shopify product ${dto.shopifyProductId} to user ${userId}`,
    );

    return this.remediesService.suggestProductRemedy(
      astrologerId,
      astrologerName,
      orderId,
      userId,
      dto,
    );
  }

  /**
   * GET /api/v1/astrologer/remedies
   * Get remedies suggested by astrologer
   */
  @Get()
  async getRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    const safeLimit = Math.min(limit, 100);

    this.logger.log(`Fetching remedies for astrologer: ${astrologerId}`);

    return this.remediesService.getAstrologerRemedies(
      astrologerId,
      page,
      safeLimit,
      { status, type },
    );
  }

  /**
   * GET /api/v1/astrologer/remedies/stats/summary
   * Get astrologer remedy statistics
   */
  @Get('stats/summary')
  async getRemedyStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    this.logger.log(`Fetching remedy stats for astrologer: ${astrologerId}`);

    return this.remediesService.getAstrologerRemedyStats(astrologerId);
  }

  /**
   * GET /api/v1/astrologer/users/:userId/shopify-orders
   * View user's purchase history (context for recommendations)
   */
  @Get('users/:userId/shopify-orders')
  async getUserPurchaseHistory(@Param('userId') userId: string) {
    this.logger.log(
      `Fetching purchase history for user: ${userId}`,
    );

    return this.shopifyOrdersService.getUserOrders(userId, 1, 100);
  }
}
