import { Controller, Get, Query, Param } from '@nestjs/common';
import { ShopifyStorefrontService } from '../services/shopify-storefront.service';

@Controller('shopify/products')
export class ShopifyProductsController {
  constructor(private readonly shopifyService: ShopifyStorefrontService) {}

  // GET /shopify/products/categories
  @Get('categories')
  async getCategories() {
    return this.shopifyService.getCollections();
  }

  // GET /shopify/products?collectionId=xxx&limit=20
  @Get()
  async getProducts(
    @Query('collectionId') collectionId?: string,
    @Query('search') search?: string,
    @Query('limit') limit = 20,
  ) {
    if (search) {
      return this.shopifyService.searchProducts(search, limit);
    }
    if (collectionId) {
      return this.shopifyService.getProductsByCollection(collectionId, limit);
    }
    throw new Error('Provide either collectionId or search parameter');
  }

  // GET /shopify/products/:id
  @Get(':id')
  async getProductById(@Param('id') id: string) {
    return this.shopifyService.getProductById(id);
  }

  // GET /shopify/products/batch?ids=xxx,yyy,zzz
  @Get('batch')
  async getProductsByIds(@Query('ids') ids: string) {
    const productIds = ids.split(',');
    return this.shopifyService.getProductsByIds(productIds);
  }
}
