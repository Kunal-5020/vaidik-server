import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Remedy, RemedyDocument } from '../schemas/remedies.schema';
import { SuggestManualRemedyDto } from '../dto/suggest-manual-remedy.dto';
import { SuggestProductRemedyDto } from '../dto/suggest-product-remedy.dto';
import { UpdateRemedyStatusDto } from '../dto/update-remedy-status.dto';
import { ShopifyService } from '../../shopify/services/shopify.service';

@Injectable()
export class RemediesService {
  private readonly logger = new Logger(RemediesService.name);

  constructor(
    @InjectModel(Remedy.name) private remedyModel: Model<RemedyDocument>,
    private shopifyService: ShopifyService,
  ) {}

  /**
   * Generate unique remedy ID
   */
  private generateRemedyId(): string {
    return `REM_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  /**
   * Convert string ID to ObjectId
   */
  private toObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }

  // ============= ASTROLOGER METHODS =============

  /**
   * Suggest manual text remedy
   */
  async suggestManualRemedy(
    astrologerId: string,
    astrologerName: string,
    orderId: string,
    userId: string,
    dto: SuggestManualRemedyDto,
  ): Promise<any> {
    try {
      const remedyId = this.generateRemedyId();

      const remedy = new this.remedyModel({
        remedyId,
        userId: this.toObjectId(userId),
        orderId,
        astrologerId: this.toObjectId(astrologerId),
        astrologerName,
        remedySource: 'manual',
        title: dto.title,
        description: dto.description,
        type: dto.type,
        usageInstructions: dto.usageInstructions,
        recommendationReason: dto.recommendationReason,
        suggestedInChannel: dto.suggestedInChannel,
        status: 'suggested',
      });

      await remedy.save();

      this.logger.log(
        `Suggested manual remedy ${remedyId} for user ${userId}`,
      );

      return {
        success: true,
        message: 'Remedy suggested successfully',
        data: remedy,
      };
    } catch (error: any) {
      this.logger.error(`Error suggesting remedy: ${error.message}`);
      throw new BadRequestException(`Failed to suggest remedy: ${error.message}`);
    }
  }

  /**
   * Suggest Shopify product as remedy
   */
  async suggestProductRemedy(
    astrologerId: string,
    astrologerName: string,
    orderId: string,
    userId: string,
    dto: SuggestProductRemedyDto,
  ): Promise<any> {
    try {
      this.logger.log(
        `Suggesting product ${dto.shopifyProductId} to user ${userId}`,
      );

      // Fetch product from Shopify
      const shopifyProduct = await this.shopifyService.getProductById(
        dto.shopifyProductId,
      );

      // Format product for remedy
      const formattedProduct = this.shopifyService.formatProductForRemedy(
        shopifyProduct,
      );

      // Create remedy
      const remedyId = this.generateRemedyId();

      const remedy = new this.remedyModel({
        remedyId,
        userId: this.toObjectId(userId),
        orderId,
        astrologerId: this.toObjectId(astrologerId),
        astrologerName,
        remedySource: 'shopify_product',
        shopifyProduct: formattedProduct,
        recommendationReason: dto.recommendationReason,
        usageInstructions: dto.usageInstructions,
        suggestedInChannel: dto.suggestedInChannel,
        status: 'suggested',
        isPurchased: false,
      });

      await remedy.save();

      this.logger.log(
        `Suggested Shopify product ${remedyId} for user ${userId}`,
      );

      return {
        success: true,
        message: 'Product recommendation created successfully',
        data: remedy,
      };
    } catch (error: any) {
      this.logger.error(
        `Error suggesting product: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to suggest product: ${error.message}`,
      );
    }
  }

  /**
   * Get remedies suggested by astrologer
   */
  async getAstrologerRemedies(
    astrologerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string },
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {
      astrologerId: this.toObjectId(astrologerId),
      isDeleted: false,
    };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) {
      query.$or = [{ type: filters.type }, { 'shopifyProduct.type': filters.type }];
    }

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        remedies,
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

  // ============= USER METHODS =============

  /**
   * Get remedies suggested in specific order (ONLY astrologer suggestions)
   */
  async getRemediesByOrder(
    orderId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = this.toObjectId(userId);

    const query = {
      orderId,
      userId: userObjectId,
      isDeleted: false,
    };

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate('astrologerId', 'name profilePicture experienceYears specializations ratings')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        remedies,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get all remedies for user (across all orders)
   */
  async getUserRemedies(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string },
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = this.toObjectId(userId);

    const query: any = {
      userId: userObjectId,
      isDeleted: false,
    };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) {
      query.$or = [{ type: filters.type }, { 'shopifyProduct.type': filters.type }];
    }

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate(
          'astrologerId',
          'name profilePicture experienceYears specializations',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        remedies,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get single remedy details
   */
  async getRemedyDetails(remedyId: string, userId: string): Promise<any> {
    const userObjectId = this.toObjectId(userId);

    const remedy = await this.remedyModel
      .findOne({
        remedyId,
        userId: userObjectId,
        isDeleted: false,
      })
      .populate(
        'astrologerId',
        'name profilePicture experienceYears specializations ratings',
      )
      .lean();

     // ❌ Do NOT throw 404
  if (!remedy) {
    return {
      success: false,
      message: 'Remedy not found',
      data: null,
    };
  }

    return {
      success: true,
      data: remedy,
    };
  }

  /**
   * Update remedy status (accept/reject)
   */
  async updateRemedyStatus(
    remedyId: string,
    userId: string,
    dto: UpdateRemedyStatusDto,
  ): Promise<any> {
    const userObjectId = this.toObjectId(userId);

    const remedy = await this.remedyModel.findOne({
      remedyId,
      userId: userObjectId,
      status: 'suggested',
      isDeleted: false,
    });

    if (!remedy) {
      throw new NotFoundException('Remedy not found or already responded');
    }

    remedy.status = dto.status;
    remedy.userNotes = dto.notes;

    if (dto.status === 'accepted') {
      remedy.acceptedAt = new Date();
    } else if (dto.status === 'rejected') {
      remedy.rejectedAt = new Date();
    }

    await remedy.save();

    this.logger.log(
      `Remedy ${remedyId} status updated to ${dto.status} by user ${userId}`,
    );

    return {
      success: true,
      message: `Remedy ${dto.status} successfully`,
      data: remedy,
    };
  }

  // ============= TRACKING METHODS =============

  /**
   * Update remedy when product is purchased
   * Called from Shopify webhook
   */
  async markAsPurchased(
    shopifyProductId: number,
    shopifyOrderId: number,
    orderNumber: string,
    lineItemId: number,
    amount: number,
    quantity: number,
    variantId: number,
    purchaseDate: Date,
  ): Promise<void> {
    try {
      this.logger.log(
        `Marking remedies as purchased for product ${shopifyProductId}`,
      );

      // Find all remedies with this Shopify product
      const remedies = await this.remedyModel.find({
        'shopifyProduct.productId': shopifyProductId,
        'shopifyProduct.variantId': variantId,
        isPurchased: false,
      });

      if (remedies.length === 0) {
        this.logger.debug(
          `No remedies found for product ${shopifyProductId}`,
        );
        return;
      }

      // Update each remedy
      for (const remedy of remedies) {
        remedy.isPurchased = true;
        remedy.purchaseDetails = {
          shopifyOrderId,
          orderNumber,
          lineItemId,
          purchasedAt: purchaseDate,
          amount,
          quantity,
          variantId,
        };

        // Auto-accept if it was in "suggested" status
        if (remedy.status === 'suggested') {
          remedy.status = 'accepted';
          remedy.acceptedAt = new Date();
        }

        await remedy.save();
        this.logger.log(
          `Updated remedy ${remedy.remedyId} - marked as purchased`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error marking remedies as purchased: ${error.message}`,
      );
      throw error;
    }
  }

  // ============= STATISTICS =============

  /**
   * User remedy statistics
   */
  async getUserRemedyStats(userId: string): Promise<any> {
    const userObjectId = this.toObjectId(userId);

    const [total, suggested, accepted, rejected, purchased, byType] =
      await Promise.all([
        this.remedyModel.countDocuments({
          userId: userObjectId,
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          userId: userObjectId,
          status: 'suggested',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          userId: userObjectId,
          status: 'accepted',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          userId: userObjectId,
          status: 'rejected',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          userId: userObjectId,
          isPurchased: true,
          isDeleted: false,
        }),
        this.remedyModel.aggregate([
          { $match: { userId: userObjectId, isDeleted: false } },
          {
            $group: {
              _id: {
                $cond: [
                  '$shopifyProduct',
                  '$shopifyProduct.type',
                  '$type',
                ],
              },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    return {
      success: true,
      data: {
        total,
        suggested,
        accepted,
        rejected,
        purchased,
        acceptanceRate: total > 0
          ? ((accepted / total) * 100).toFixed(1)
          : '0',
        purchaseRate: total > 0 ? ((purchased / total) * 100).toFixed(1) : '0',
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    };
  }

  /**
   * Astrologer statistics
   */
  async getAstrologerRemedyStats(astrologerId: string): Promise<any> {
    const astrologerObjectId = this.toObjectId(astrologerId);

    const [total, suggested, accepted, rejected, purchased, byType] =
      await Promise.all([
        this.remedyModel.countDocuments({
          astrologerId: astrologerObjectId,
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          astrologerId: astrologerObjectId,
          status: 'suggested',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          astrologerId: astrologerObjectId,
          status: 'accepted',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          astrologerId: astrologerObjectId,
          status: 'rejected',
          isDeleted: false,
        }),
        this.remedyModel.countDocuments({
          astrologerId: astrologerObjectId,
          isPurchased: true,
          isDeleted: false,
        }),
        this.remedyModel.aggregate([
          {
            $match: {
              astrologerId: astrologerObjectId,
              isDeleted: false,
            },
          },
          {
            $group: {
              _id: {
                $cond: [
                  '$shopifyProduct',
                  '$shopifyProduct.type',
                  '$type',
                ],
              },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    const acceptanceRate =
      total > 0 ? ((accepted / total) * 100).toFixed(1) : '0';
    const purchaseRate =
      total > 0 ? ((purchased / total) * 100).toFixed(1) : '0';

    return {
      success: true,
      data: {
        total,
        suggested,
        accepted,
        rejected,
        purchased,
        acceptanceRate: `${acceptanceRate}%`,
        purchaseRate: `${purchaseRate}%`,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    };
  }

  // ============= INTERNAL METHODS =============

  /**
   * Get remedies by order ID (internal use)
   */
  async getRemediesByOrderId(orderId: string): Promise<RemedyDocument[]> {
    return this.remedyModel.find({ orderId, isDeleted: false });
  }

  // ============= NEW METHODS FOR TABS =============

/**
 * Get suggested remedies (Tab 1: Suggested)
 * Shows products suggested but NOT purchased
 */
async getSuggestedRemedies(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<any> {
  const skip = (page - 1) * limit;
  const userObjectId = this.toObjectId(userId);

  // 🔍 DEBUG LOGS
  this.logger.log(`🔍 Checking Suggested Remedies for User ID: ${userId}`);
  this.logger.log(`   Converted ObjectId: ${userObjectId}`);

  const query = {
    userId: userObjectId,
    isPurchased: false,
    status: { $in: ['suggested', 'accepted'] },
    isDeleted: false,
  };

  const [remedies, total] = await Promise.all([
    this.remedyModel
      .find(query)
      .populate('astrologerId', 'name profilePicture') // Ensure populate works
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.remedyModel.countDocuments(query),
  ]);

  // 🔍 DEBUG RESULT
  this.logger.log(`   Found ${total} remedies matching query.`);

  return {
    success: true,
    data: {
      remedies,
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
 * Get purchased remedies (Tab 2: Purchased)
 * Shows products that were suggested AND purchased
 */
async getPurchasedRemedies(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<any> {
  const skip = (page - 1) * limit;
  const userObjectId = this.toObjectId(userId);

  const query = {
    userId: userObjectId,
    isPurchased: true, // Purchased
    isDeleted: false,
  };

  const [remedies, total] = await Promise.all([
    this.remedyModel
      .find(query)
      .populate(
        'astrologerId',
        'name profilePicture experienceYears specializations',
      )
      .sort({ 'purchaseDetails.purchasedAt': -1 }) // Latest purchase first
      .skip(skip)
      .limit(limit)
      .lean(),
    this.remedyModel.countDocuments(query),
  ]);

  return {
    success: true,
    data: {
      remedies,
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
 * Get orders with remedies (Tab 3: Remedy Chat)
 * Shows list of orders that have remedy suggestions
 */
async getOrdersWithRemedies(userId: string): Promise<any> {
  const userObjectId = this.toObjectId(userId);

  const ordersWithRemedies = await this.remedyModel.aggregate([
    {
      $match: {
        userId: userObjectId,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$orderId', // Group by order
        orderId: { $first: '$orderId' },
        astrologerId: { $first: '$astrologerId' },
        astrologerName: { $first: '$astrologerName' },
        totalRemedies: { $sum: 1 },
        purchasedCount: {
          $sum: { $cond: ['$isPurchased', 1, 0] },
        },
        suggestedCount: {
          $sum: { $cond: [{ $eq: ['$isPurchased', false] }, 1, 0] },
        },
        latestSuggestion: { $max: '$createdAt' },
        firstSuggestion: { $min: '$createdAt' },
      },
    },
    {
      $sort: { latestSuggestion: -1 }, // Latest first
    },
  ]);

  this.logger.log(
    `Found ${ordersWithRemedies.length} orders with remedies for user ${userId}`,
  );

  return {
    success: true,
    data: {
      orders: ordersWithRemedies,
      total: ordersWithRemedies.length,
    },
  };
}

/**
 * Suggest multiple products at once (Bulk suggestion)
 * Used when astrologer selects multiple products
 */
async suggestBulkProducts(
  astrologerId: string,
  astrologerName: string,
  orderId: string,
  userId: string,
  products: Array<{
    shopifyProductId: number;
    shopifyVariantId?: number;
    recommendationReason: string;
    usageInstructions?: string;
    suggestedInChannel?: 'call' | 'chat';
  }>,
): Promise<any> {
  try {
    this.logger.log(
      `Suggesting ${products.length} products to user ${userId} in order ${orderId}`,
    );

    const createdRemedies: any[] = [];

    for (const product of products) {
      const dto = {
        shopifyProductId: product.shopifyProductId,
        shopifyVariantId: product.shopifyVariantId,
        recommendationReason: product.recommendationReason,
        usageInstructions: product.usageInstructions,
        suggestedInChannel: product.suggestedInChannel,
      };

      const remedy = await this.suggestProductRemedy(
        astrologerId,
        astrologerName,
        orderId,
        userId,
        dto,
      );

      createdRemedies.push(remedy.data);
    }

    this.logger.log(
      `Successfully suggested ${createdRemedies.length} products`,
    );

    return {
      success: true,
      message: `${createdRemedies.length} remedies suggested successfully`,
      data: {
        remedies: createdRemedies,
        count: createdRemedies.length,
      },
    };
  } catch (error: any) {
    this.logger.error(
      `Error in bulk suggestion: ${error.message}`,
      error.stack,
    );
    throw new BadRequestException(
      `Failed to suggest products: ${error.message}`,
    );
  }
}

}
