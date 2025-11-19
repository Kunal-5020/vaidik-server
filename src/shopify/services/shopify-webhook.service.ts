import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'; // ✅ Import forwardRef
import { RemediesService } from '../../remedies/services/remedies.service';

@Injectable()
export class ShopifyWebhookService {
  private readonly logger = new Logger(ShopifyWebhookService.name);

  constructor(
    @Inject(forwardRef(() => RemediesService)) // ✅ FIX: Use forwardRef in constructor
    private remediesService: RemediesService,
  ) {}

  /**
   * Handle Shopify order creation webhook
   * Called when a customer completes a purchase
   */
  async handleOrderCreated(orderData: any): Promise<void> {
    try {
      this.logger.log(`📦 Shopify Order Created: ${orderData.id}`);
      this.logger.log(`   Order Number: ${orderData.name}`);
      this.logger.log(`   Customer: ${orderData.customer?.email || 'Unknown'}`);
      this.logger.log(`   Total: ${orderData.currency} ${orderData.total_price}`);

      // Extract line items (products purchased)
      const lineItems = orderData.line_items || [];
      
      if (lineItems.length === 0) {
        this.logger.warn('No line items in order');
        return;
      }

      this.logger.log(`   Products: ${lineItems.length} items`);

      // Process each product in the order
      for (const lineItem of lineItems) {
        await this.processLineItem(lineItem, orderData);
      }

      this.logger.log(`✅ Successfully processed order ${orderData.id}`);
    } catch (error: any) {
      this.logger.error(
        `❌ Error handling order webhook: ${error.message}`,
        error.stack,
      );
      // Don't throw - we don't want to fail the webhook
    }
  }

  /**
   * Process individual line item (product) from order
   */
  private async processLineItem(lineItem: any, orderData: any): Promise<void> {
    try {
      const productId = lineItem.product_id;
      const variantId = lineItem.variant_id;

      if (!productId) {
        this.logger.warn(
          `Line item ${lineItem.id} has no product_id, skipping`,
        );
        return;
      }

      this.logger.log(
        `   Processing product: ${lineItem.title} (ID: ${productId}, Variant: ${variantId})`,
      );

      // Calculate amounts
      const quantity = lineItem.quantity || 1;
      const pricePerUnit = parseFloat(lineItem.price || '0');
      const totalAmount = pricePerUnit * quantity;

      // Call RemediesService to mark as purchased
      await this.remediesService.markAsPurchased(
        productId,
        orderData.id,
        orderData.name, // Order number (e.g., "#1234")
        lineItem.id,
        totalAmount,
        quantity,
        variantId,
        new Date(orderData.created_at),
      );

      this.logger.log(
        `   ✅ Marked remedies as purchased for product ${productId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `   ❌ Error processing line item: ${error.message}`,
      );
    }
  }

  /**
   * Handle order update webhook (optional)
   * Called when order status changes
   */
  async handleOrderUpdated(orderData: any): Promise<void> {
    this.logger.log(`📝 Order Updated: ${orderData.id}`);
    // You can add logic here if needed in the future
    // For example: handle refunds, cancellations, etc.
  }
}
