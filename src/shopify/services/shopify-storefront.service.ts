import { Injectable, Logger } from '@nestjs/common';
import Client from 'shopify-buy';

@Injectable()
export class ShopifyStorefrontService {
  private readonly logger = new Logger(ShopifyStorefrontService.name);
  private client: any;

  constructor() {
    this.client = Client.buildClient({
      domain: process.env.SHOPIFY_STORE_DOMAIN,
      storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    });
  }

  // Fetch all product categories (collections)
  async getCollections() {
    try {
      const collections = await this.client.collection.fetchAll();
      return collections.map(col => ({
        id: col.id,
        title: col.title,
        handle: col.handle,
        description: col.description,
        image: col.image?.src || null,
      }));
    } catch (error) {
      this.logger.error('Error fetching collections', error);
      throw error;
    }
  }

  // Fetch products by collection
  async getProductsByCollection(collectionId: string, limit = 20) {
    try {
      const collection = await this.client.collection.fetchWithProducts(collectionId, {
        productsFirst: limit,
      });
      return this.formatProducts(collection.products);
    } catch (error) {
      this.logger.error('Error fetching products', error);
      throw error;
    }
  }

  // Search products
  async searchProducts(query: string, limit = 20) {
    try {
      const products = await this.client.product.fetchQuery({
        first: limit,
        query: `title:*${query}* OR tag:${query}`,
      });
      return this.formatProducts(products);
    } catch (error) {
      this.logger.error('Error searching products', error);
      throw error;
    }
  }

  // Get single product details
  async getProductById(productId: string) {
    try {
      const product = await this.client.product.fetch(productId);
      return this.formatProduct(product);
    } catch (error) {
      this.logger.error('Error fetching product', error);
      throw error;
    }
  }

  // Get products by IDs (for astrologer suggestions)
  async getProductsByIds(productIds: string[]) {
    try {
      const products = await Promise.all(
        productIds.map(id => this.client.product.fetch(id))
      );
      return this.formatProducts(products);
    } catch (error) {
      this.logger.error('Error fetching products by IDs', error);
      throw error;
    }
  }

  // Helper: Format products
  private formatProducts(products: any[]) {
    return products.map(p => this.formatProduct(p));
  }

  private formatProduct(product: any) {
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      description: product.description,
      descriptionHtml: product.descriptionHtml,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      images: product.images.map(img => ({
        id: img.id,
        src: img.src,
        altText: img.altText,
      })),
      variants: product.variants.map(v => ({
        id: v.id,
        title: v.title,
        price: v.price.amount,
        currencyCode: v.price.currencyCode,
        available: v.available,
        image: v.image?.src || null,
      })),
      priceRange: {
        min: product.variants[0]?.price.amount || '0',
        max: product.variants[product.variants.length - 1]?.price.amount || '0',
        currencyCode: product.variants[0]?.price.currencyCode || 'INR',
      },
      availableForSale: product.availableForSale,
      onlineStoreUrl: product.onlineStoreUrl,
    };
  }
}
