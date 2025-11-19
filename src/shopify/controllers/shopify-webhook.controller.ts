import { 
  Controller, 
  Post, 
  Req, 
  Res, 
  Headers, 
  HttpCode,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express'; // ✅ FIX 1: Use 'import type'
import { ShopifyWebhookService } from '../services/shopify-webhook.service';
import * as crypto from 'crypto';

// ✅ FIX 2: Define custom interface for raw body request
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('shopify/webhooks')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly webhookService: ShopifyWebhookService,
  ) {}

  /**
   * POST /shopify/webhooks/orders/create
   * Receives Shopify order creation webhooks
   */
  @Post('orders/create')
  @HttpCode(200)
  async handleOrderCreated(
    @Req() req: RawBodyRequest, // ✅ FIX 3: Use custom interface
    @Res() res: Response,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
  ) {
    this.logger.log('📥 Webhook received: orders/create');
    this.logger.log(`   Shop: ${shopDomain}`);

    // ✅ FIX 4: Check if rawBody exists
    if (!req.rawBody) {
      this.logger.error('❌ No raw body found in request');
      return res.status(400).send('Bad Request: No raw body');
    }

    // Step 1: Verify webhook authenticity
    const verified = this.verifyWebhook(req.rawBody, hmac);

    if (!verified) {
      this.logger.error('❌ Webhook verification FAILED - Invalid signature');
      return res.status(401).send('Unauthorized');
    }

    this.logger.log('✅ Webhook signature verified');

    try {
      // Step 2: Process the order
      const orderData = req.body;
      await this.webhookService.handleOrderCreated(orderData);

      this.logger.log('✅ Webhook processed successfully');
      return res.status(200).send('OK');
    } catch (error: any) {
      this.logger.error(`❌ Error processing webhook: ${error.message}`);
      // Still return 200 to prevent Shopify retries
      return res.status(200).send('Error logged');
    }
  }

  /**
   * Verify Shopify webhook signature using HMAC
   */
  private verifyWebhook(body: Buffer, hmac: string): boolean {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

    if (!secret) {
      this.logger.error('⚠️  SHOPIFY_WEBHOOK_SECRET not configured!');
      return false;
    }

    if (!hmac) {
      this.logger.error('⚠️  No HMAC header provided');
      return false;
    }

    // Create HMAC hash from raw body
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body) // ✅ FIX 5: Remove 'utf8' - Buffer doesn't need encoding
      .digest('base64');

    // Compare with Shopify's signature
    const isValid = hash === hmac;

    if (!isValid) {
      this.logger.debug(`Expected: ${hash}`);
      this.logger.debug(`Received: ${hmac}`);
    }

    return isValid;
  }
}
