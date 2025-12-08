// src/admin/features/review-moderation/services/admin-review-moderation.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { Review, ReviewDocument } from '../../../../reviews/schemas/review.schema';
import { RatingReviewService } from '../../../../astrologers/services/rating-review.service';

@Injectable()
export class AdminReviewModerationService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>, // ✅ ADD
    private ratingReviewService: RatingReviewService,
  ) {}

  /**
   * ✅ Get reviews for moderation
   */
  async getReviewsForModeration(
    page = 1,
    limit = 20,
    status: 'pending' | 'approved' | 'rejected' | 'flagged' | 'all' = 'pending',
  ) {
    const skip = (page - 1) * limit;
    
    // ✅ Build query for Review collection
    const filter: any = { isDeleted: false };
    
    if (status !== 'all') {
      filter.moderationStatus = status;
    }

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('userId', 'name phoneNumber profileImage')
        .populate('astrologerId', 'name email profilePicture ratings')
        .populate('moderatedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reviewModel.countDocuments(filter),
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

  /**
   * ✅ Approve review
   */
  async approveReview(reviewId: string, adminId: Types.ObjectId) {
    const review = await this.reviewModel.findOne({ reviewId });
    
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.moderationStatus = 'approved';
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    await review.save();

    // ✅ Update astrologer ratings with approved review
    await this.ratingReviewService.updateAstrologerRatings(review.astrologerId.toString());

    return {
      success: true,
      message: 'Review approved',
    };
  }

  /**
   * ✅ Reject review
   */
  async rejectReview(reviewId: string, adminId: Types.ObjectId, reason: string) {
    const review = await this.reviewModel.findOne({ reviewId });
    
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.moderationStatus = 'rejected';
    review.moderationReason = reason;
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    await review.save();

    // ✅ Update astrologer ratings (removes rejected review from calculation)
    await this.ratingReviewService.updateAstrologerRatings(review.astrologerId.toString());

    return {
      success: true,
      message: 'Review rejected',
    };
  }

  /**
   * ✅ Flag review
   */
  async flagReview(reviewId: string, adminId: Types.ObjectId, reason: string) {
    const review = await this.reviewModel.findOne({ reviewId });
    
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.moderationStatus = 'flagged';
    review.moderationReason = reason;
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    await review.save();

    return {
      success: true,
      message: 'Review flagged for manual review',
    };
  }

  /**
   * ✅ Get moderation stats
   */
  async getModerationStats() {
    const stats = await this.reviewModel.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$moderationStatus',
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

  /**
   * ✅ Get review details
   */
  async getReviewDetails(reviewId: string) {
    const review = await this.reviewModel
      .findOne({ reviewId })
      .populate('userId', 'name email phoneNumber profileImage')
      .populate('astrologerId', 'name profilePicture ratings')
      .populate('moderatedBy', 'name email')
      .lean();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Get order details
    const order = await this.orderModel
      .findOne({ orderId: review.orderId })
      .select('orderId type status totalAmount createdAt')
      .lean();

    return {
      success: true,
      data: {
        review,
        order,
      },
    };
  }
}
