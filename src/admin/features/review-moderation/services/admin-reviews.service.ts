import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { RatingReviewService } from '../../../../astrologers/services/rating-review.service';

@Injectable()
export class AdminReviewModerationService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private ratingReviewService: RatingReviewService,
  ) {}

  // Get reviews for moderation
  async getReviewsForModeration(
    page = 1,
    limit = 20,
    status: 'pending' | 'approved' | 'rejected' | 'flagged' | 'all' = 'pending',
  ) {
    const skip = (page - 1) * limit;
    const filter: any = { reviewSubmitted: true, rating: { $gte: 1 } };
    
    if (status !== 'all') {
      filter.reviewModerationStatus = status;
    }

    const [reviews, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .populate('userId', 'name phoneNumber profileImage')
        .populate('astrologerId', 'name email profilePicture ratings')
        .populate('reviewModeratedBy', 'name email')
        .sort({ reviewSubmittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Approve review - ✅ FIXED: adminId accepts Types.ObjectId
  async approveReview(orderId: string, adminId: Types.ObjectId) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order || !order.reviewSubmitted) {
      throw new NotFoundException('Review not found');
    }

    order.reviewModerationStatus = 'approved';
    order.reviewModeratedBy = adminId;
    order.reviewModeratedAt = new Date();
    await order.save();

    // Update astrologer ratings with approved review
    await this.ratingReviewService.updateAstrologerRatings(order.astrologerId.toString());

    return {
      success: true,
      message: 'Review approved',
    };
  }

  // Reject review - ✅ FIXED: adminId accepts Types.ObjectId
  async rejectReview(orderId: string, adminId: Types.ObjectId, reason: string) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order || !order.reviewSubmitted) {
      throw new NotFoundException('Review not found');
    }

    order.reviewModerationStatus = 'rejected';
    order.reviewModerationReason = reason;
    order.reviewModeratedBy = adminId;
    order.reviewModeratedAt = new Date();
    await order.save();

    // Update astrologer ratings (removes rejected review from calculation)
    await this.ratingReviewService.updateAstrologerRatings(order.astrologerId.toString());

    return {
      success: true,
      message: 'Review rejected',
    };
  }

  // ✅ ADD THIS NEW METHOD: Flag review
  async flagReview(orderId: string, adminId: Types.ObjectId, reason: string) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order || !order.reviewSubmitted) {
      throw new NotFoundException('Review not found');
    }

    order.reviewModerationStatus = 'flagged';
    order.reviewModerationReason = reason;
    order.reviewModeratedBy = adminId;
    order.reviewModeratedAt = new Date();
    await order.save();

    return {
      success: true,
      message: 'Review flagged for manual review',
    };
  }

  // Get moderation stats
  async getModerationStats() {
    const stats = await this.orderModel.aggregate([
      { $match: { reviewSubmitted: true, rating: { $gte: 1 } } },
      {
        $group: {
          _id: '$reviewModerationStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const statsMap = stats.reduce((acc, stat) => {
      acc[stat._id || 'pending'] = stat.count;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        pending: statsMap.pending || 0,
        approved: statsMap.approved || 0,
        rejected: statsMap.rejected || 0,
        flagged: statsMap.flagged || 0,
        total: Object.values(statsMap).reduce((a: number, b: number) => a + b, 0),
      },
    };
  }
}
