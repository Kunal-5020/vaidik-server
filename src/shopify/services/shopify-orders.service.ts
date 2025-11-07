import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShopifyOrderEntity, ShopifyOrderDocument } from '../schemas/shopify-order.schema';
import { ShopifyService } from './shopify.service';
import { SyncShopifyOrdersDto } from '../dto/sync-orders.dto';

@Injectable()
export class ShopifyOrdersService {
  private readonly logger = new Logger(ShopifyOrdersService.name);

  constructor(
    @InjectModel(ShopifyOrderEntity.name)
    private shopifyOrderModel: Model<ShopifyOrderDocument>,
    private shopifyService: ShopifyService,
  ) {}

  /**
 * Sync Shopify orders for a user by phone number
 */
async syncUserOrders(
  userId: string,
  dto: SyncShopifyOrdersDto,
): Promise<any> {
  try {
    this.logger.log(
      `Starting sync for user ${userId} with phone: ${dto.userPhone}`,
    );

    // Step 1: Search for Shopify customer by phone
    const customer = await this.shopifyService.searchCustomerByPhone(
      dto.userPhone,
    );

    if (!customer) {
      throw new NotFoundException(
        `No Shopify customer found with phone: ${dto.userPhone}`,
      );
    }

    this.logger.log(`Found Shopify customer: ${customer.id}`);

    // Step 2: Get customer's orders
    const shopifyOrders = await this.shopifyService.getCustomerOrders(
      customer.id,
      dto.limit || 100,
      'any', // Get all orders
    );

    this.logger.log(`Found ${shopifyOrders.length} orders`);

    // Step 3: Sync orders to MongoDB
    let syncedCount = 0;
    const syncedOrders: ShopifyOrderDocument[] = []; // ✅ EXPLICIT TYPE

    for (const shopifyOrder of shopifyOrders) {
      try {
        const savedOrder = await this.syncOrderToDatabase(
          userId,
          customer,
          shopifyOrder,
        );
        syncedOrders.push(savedOrder);
        syncedCount++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync order ${shopifyOrder.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Synced ${syncedCount} orders for user ${userId}`);

    return {
      success: true,
      message: `Successfully synced ${syncedCount} orders from Shopify`,
      data: {
        customer: {
          shopifyCustomerId: customer.id,
          name: `${customer.first_name} ${customer.last_name}`,
          email: customer.email,
          phone: customer.phone,
        },
        orders: syncedOrders.map((order) => ({
          shopifyOrderId: order.shopifyOrderId,
          orderNumber: order.orderNumber,
          createdAt: order.shopifyCreatedAt.toISOString(),
          totalPrice: order.totalPrice,
          currency: order.currency,
          status: order.fulfillmentStatus || order.financialStatus,
          lineItems: order.lineItems,
        })),
        syncedCount,
        totalOrders: shopifyOrders.length,
      },
    };
  } catch (error: any) {
    this.logger.error(`Sync failed: ${error.message}`);
    throw new HttpException(
      `Failed to sync orders: ${error.message}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

  /**
   * Save or update order in database
   */
  private async syncOrderToDatabase(
    userId: string,
    customer: any,
    shopifyOrder: any,
  ): Promise<ShopifyOrderDocument> {
    const formattedPhone = this.shopifyService.formatPhoneNumber(
      customer.phone || '',
    );

    // Check if order already exists
    let order = await this.shopifyOrderModel.findOne({
      shopifyOrderId: shopifyOrder.id,
    });

    const orderData = {
      shopifyOrderId: shopifyOrder.id,
      orderNumber: shopifyOrder.name,
      userId: new Types.ObjectId(userId),
      shopifyCustomerId: customer.id,
      customerPhone: formattedPhone,
      customerEmail: shopifyOrder.email || customer.email,
      customerName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      lineItems: (shopifyOrder.line_items || []).map((item: any) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
      })),
      financialStatus: shopifyOrder.financial_status,
      fulfillmentStatus: shopifyOrder.fulfillment_status,
      totalPrice: shopifyOrder.total_price,
      totalTax: shopifyOrder.total_tax || '0',
      currency: shopifyOrder.currency,
      shopifyCreatedAt: new Date(shopifyOrder.created_at),
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
      syncedAt: new Date(),
    };

    if (order) {
      // Update existing
      Object.assign(order, orderData);
      return await order.save();
    } else {
      // Create new
      order = new this.shopifyOrderModel(orderData);
      return await order.save();
    }
  }

  /**
   * Get user's synced orders
   */
  async getUserOrders(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    const [orders, total] = await Promise.all([
      this.shopifyOrderModel
        .find({ userId: userObjectId, isDeleted: false })
        .sort({ shopifyCreatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.shopifyOrderModel.countDocuments({
        userId: userObjectId,
        isDeleted: false,
      }),
    ]);

    return {
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    };
  }

  /**
   * Get single order details
   */
  async getOrderDetails(orderId: string, userId: string): Promise<any> {
    try {
      const userObjectId = new Types.ObjectId(userId);

      const order = await this.shopifyOrderModel.findOne({
        _id: new Types.ObjectId(orderId),
        userId: userObjectId,
        isDeleted: false,
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      return {
        success: true,
        data: order,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Invalid order ID');
    }
  }

  /**
   * Get orders by phone number (used by astrologer)
   */
  async getOrdersByPhone(phone: string): Promise<ShopifyOrderDocument[]> {
    const formattedPhone = this.shopifyService.formatPhoneNumber(phone);

    return this.shopifyOrderModel.find({
      customerPhone: formattedPhone,
      isDeleted: false,
    });
  }

  /**
   * Update order when Shopify webhook fires
   */
  async handleWebhookOrderUpdate(shopifyOrder: any): Promise<void> {
    const order = await this.shopifyOrderModel.findOne({
      shopifyOrderId: shopifyOrder.id,
    });

    if (order) {
      order.financialStatus = shopifyOrder.financial_status;
      order.fulfillmentStatus = shopifyOrder.fulfillment_status;
      order.shopifyUpdatedAt = new Date(shopifyOrder.updated_at);
      await order.save();

      this.logger.log(
        `Updated order ${shopifyOrder.id} via webhook`,
      );
    }
  }
}
