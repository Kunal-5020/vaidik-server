import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ShopifyConfig } from '../shopify.config';
import {
  ShopifyProduct,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyLineItem,
} from '../interfaces/shopify-api.interface';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly cache = new Map<string, { data: any; expiry: number }>();

  constructor(
    private httpService: HttpService,
    private shopifyConfig: ShopifyConfig,
  ) {}

  /**
   * Format phone number to Shopify format (+91XXXXXXXXXX)
   */
  formatPhoneNumber(phone: string): string {
    // Remove non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If doesn't start with +, assume India (+91)
    if (!cleaned.startsWith('+')) {
      // Remove leading 0 if present
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      cleaned = '+91' + cleaned;
    }

    return cleaned;
  }

  /**
   * Search for customer by phone number
   */
  async searchCustomerByPhone(
    phone: string,
  ): Promise<ShopifyCustomer | null> {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      const cacheKey = `customer:phone:${formattedPhone}`;

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for customer: ${formattedPhone}`);
        return cached;
      }

      const query = `phone:"${formattedPhone}"`;
      const url = `${this.shopifyConfig.getBaseUrl()}/customers/search.json`;

      this.logger.log(`Searching Shopify customer: ${formattedPhone}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { query },
          headers: this.shopifyConfig.getHeaders(),
        }),
      );

      const customers = response.data.customers || [];

      if (customers.length === 0) {
        this.logger.warn(`No Shopify customer found: ${formattedPhone}`);
        return null;
      }

      const customer = customers[0];
      this.setInCache(cacheKey, customer, 300000); // 5 min cache

      return customer;
    } catch (error: any) {
      this.logger.error(
        `Error searching customer: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to search Shopify customer: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get customer orders
   */
  async getCustomerOrders(
    customerId: number,
    limit: number = 100,
    status: string = 'any',
  ): Promise<ShopifyOrder[]> {
    try {
      const cacheKey = `orders:customer:${customerId}:${status}`;

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for customer orders: ${customerId}`);
        return cached;
      }

      const url = `${this.shopifyConfig.getBaseUrl()}/customers/${customerId}/orders.json`;

      this.logger.log(`Fetching orders for customer: ${customerId}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            limit,
            status, // any, cancelled, fulfilled, pending, restocked, unfulfilled
            fields:
              'id,email,phone,customer,order_number,name,created_at,updated_at,processed_at,financial_status,fulfillment_status,total_price,total_tax,currency,line_items',
          },
          headers: this.shopifyConfig.getHeaders(),
        }),
      );

      const orders = response.data.orders || [];
      this.setInCache(cacheKey, orders, 300000); // 5 min cache

      this.logger.log(`Found ${orders.length} orders for customer ${customerId}`);
      return orders;
    } catch (error: any) {
      this.logger.error(
        `Error fetching customer orders: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to fetch orders: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Search products by query
   */
  async searchProducts(
    query: string,
    limit: number = 20,
  ): Promise<ShopifyProduct[]> {
    try {
      const cacheKey = `products:search:${query}:${limit}`;

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for product search: ${query}`);
        return cached;
      }

      const url = `${this.shopifyConfig.getBaseUrl()}/products.json`;

      this.logger.log(`Searching products: ${query}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            title: query,
            limit,
            fields:
              'id,title,handle,vendor,product_type,created_at,updated_at,published_at,tags,status,variants,images,featured_image',
          },
          headers: this.shopifyConfig.getHeaders(),
        }),
      );

      const products = response.data.products || [];
      this.setInCache(cacheKey, products, 600000); // 10 min cache

      this.logger.log(`Found ${products.length} products matching: ${query}`);
      return products;
    } catch (error: any) {
      this.logger.error(
        `Error searching products: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to search products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get product by ID
   */
  async getProductById(productId: number): Promise<ShopifyProduct> {
    try {
      const cacheKey = `product:${productId}`;

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for product: ${productId}`);
        return cached;
      }

      const url = `${this.shopifyConfig.getBaseUrl()}/products/${productId}.json`;

      this.logger.log(`Fetching product: ${productId}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: this.shopifyConfig.getHeaders(),
        }),
      );

      const product = response.data.product;
      if (!product) {
        throw new BadRequestException(`Product ${productId} not found`);
      }

      this.setInCache(cacheKey, product, 3600000); // 1 hour cache

      return product;
    } catch (error: any) {
      this.logger.error(
        `Error fetching product: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to fetch product: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get product by variant ID
   */
  async getProductByVariantId(variantId: number): Promise<ShopifyProduct | null> {
    try {
      const cacheKey = `product:variant:${variantId}`;

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for product by variant: ${variantId}`);
        return cached;
      }

      // Search all products with this variant (costly, but necessary)
      // In production, maintain a cache of variant->product mapping
      const url = `${this.shopifyConfig.getBaseUrl()}/variants/${variantId}.json`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: this.shopifyConfig.getHeaders(),
        }),
      );

      const variant = response.data.variant;
      if (!variant) {
        return null;
      }

      // Now fetch the product
      return await this.getProductById(variant.product_id);
    } catch (error: any) {
      this.logger.warn(
        `Error fetching product by variant: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Extract remedy type from product tags
   */
  extractRemedyType(product: ShopifyProduct): string {
    const validTypes = [
      'gemstone',
      'mantra',
      'puja',
      'donation',
      'yantra',
    ];
    const tags = product.tags.toLowerCase().split(',');

    for (const tag of tags) {
      if (validTypes.includes(tag.trim())) {
        return tag.trim();
      }
    }

    return 'other';
  }

  /**
   * Format product for remedy suggestion
   */
  formatProductForRemedy(product: ShopifyProduct, variant?: any): any {
    const mainVariant = variant || product.variants[0];

    return {
      productId: product.id,
      variantId: mainVariant?.id,
      productName: product.title,
      productHandle: product.handle,
      productUrl: `https://${this.shopifyConfig.getShopName()}/products/${product.handle}`,
      price: mainVariant?.price || '0',
      imageUrl: product.featured_image?.src || product.images[0]?.src || '',
      sku: mainVariant?.sku || null,
      description: product.vendor || '',
      type: this.extractRemedyType(product),
    };
  }

  // ============ HELPER METHODS ============

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  private setInCache(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
    this.logger.log(`Cache cleared: ${key || 'all'}`);
  }
}
