import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShopifyConfig {
  constructor(private configService: ConfigService) {}

  getShopName(): string {
    const shopName = this.configService.get<string>('SHOPIFY_SHOP_NAME');
    if (!shopName) {
      throw new Error('SHOPIFY_SHOP_NAME environment variable is not set');
    }
    return shopName; // e.g. "vaidik-talk"
  }

  getShopDomain(): string {
    // ✅ use SHOPIFY_STORE_DOMAIN from your .env
    const domain =
      this.configService.get<string>('SHOPIFY_STORE_DOMAIN') ||
      `${this.getShopName()}.myshopify.com`;

    if (!domain) {
      throw new Error('SHOPIFY_STORE_DOMAIN environment variable is not set');
    }
    return domain; // e.g. "vaidik-talk.myshopify.com"
  }

  getAccessToken(): string {
    const token = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');
    if (!token) {
      throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is not set');
    }
    return token;
  }

  getApiVersion(): string {
    return this.configService.get<string>('SHOPIFY_API_VERSION', '2024-10');
  }

  getBaseUrl(): string {
    return `https://${this.getShopDomain()}/admin/api/${this.getApiVersion()}`;
  }

  getHeaders(): Record<string, string> {
    return {
      'X-Shopify-Access-Token': this.getAccessToken(),
      'Content-Type': 'application/json',
    };
  }

  getWebhookSecret(): string {
    return this.configService.get<string>('SHOPIFY_WEBHOOK_SECRET', '');
  }
}
