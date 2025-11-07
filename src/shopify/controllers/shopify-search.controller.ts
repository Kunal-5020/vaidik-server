import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ShopifyService } from '../services/shopify.service';
import { SearchProductsDto } from '../dto/search-products.dto';

@Controller('shopify')
@UseGuards(JwtAuthGuard)
export class ShopifySearchController {
  private readonly logger = new Logger(ShopifySearchController.name);

  constructor(private shopifyService: ShopifyService) {}

  /**
   * GET /api/v1/shopify/search
   * Search Shopify products
   * Used by astrologer to find products to recommend
   */
  @Get('search')
  async searchProducts(
    @Query(ValidationPipe) dto: SearchProductsDto,
  ) {
    this.logger.log(`Searching products: ${dto.query}`);

    const products = await this.shopifyService.searchProducts(
      dto.query,
      dto.limit || 20,
    );

    const formatted = products.map((product) =>
      this.shopifyService.formatProductForRemedy(product),
    );

    return {
      success: true,
      data: {
        query: dto.query,
        results: formatted,
        count: formatted.length,
      },
    };
  }
}
