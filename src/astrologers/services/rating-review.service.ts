import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';

export interface ReviewData {
  userId: string;
  astrologerId: string;
  orderId: string;
  rating: number;
  review?: string;
  serviceType: 'chat' | 'call';
}

export interface ReviewResult {
  success: boolean;
  message: string;
  newRating?: number;
  totalReviews?: number;
}

@Injectable()
export class RatingReviewService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>, // ✅ Use Order collection
  ) {}

  async addReview(reviewData: ReviewData): Promise<ReviewResult> {
    const { userId, astrologerId, orderId, rating, review, serviceType } = reviewData;

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // ✅ Find the order from Order collection
    const order = await this.orderModel.findOne({ orderId, userId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if order belongs to this astrologer
    if (order.astrologerId.toString() !== astrologerId) {
      throw new BadRequestException('Order does not belong to this astrologer');
    }

    // Check if order is completed
    if (order.status !== 'completed') {
      throw new BadRequestException('Can only review completed sessions');
    }

    // Check if already reviewed
    if (order.reviewSubmitted || order.rating) {
      throw new BadRequestException('This session has already been reviewed');
    }

    // Find the astrologer
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Find the user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // ✅ Update order with rating and review
      order.rating = rating;
      order.review = review || '';
      order.reviewSubmitted = true;
      await order.save();

      // ✅ Update astrologer's ratings (using ratings object, not stats.rating)
      const currentAverage = astrologer.ratings.average || 0;
      const currentTotal = astrologer.ratings.total || 0;
      
      // Calculate new average rating
      const newTotalRatings = currentTotal + 1;
      const newAverageRating = ((currentAverage * currentTotal) + rating) / newTotalRatings;

      // Update rating breakdown
      astrologer.ratings.breakdown[rating as 1 | 2 | 3 | 4 | 5] += 1;
      astrologer.ratings.average = Math.round(newAverageRating * 10) / 10;
      astrologer.ratings.total = newTotalRatings;

      // ✅ Update user stats
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: { 'stats.totalRatings': 1 }
      });

      await astrologer.save();

      console.log(`✅ Review added: ${rating}/5 for astrologer ${astrologer.name} (Order: ${orderId})`);

      return {
        success: true,
        message: 'Review submitted successfully',
        newRating: astrologer.ratings.average,
        totalReviews: astrologer.ratings.total
      };

    } catch (error) {
      console.error('❌ Error adding review:', error);
      throw new BadRequestException('Failed to submit review. Please try again.');
    }
  }

  async getAstrologerReviews(
    astrologerId: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<any> {
    const skip = (page - 1) * limit;

    // ✅ Query from Order collection
    const [reviews, totalReviews] = await Promise.all([
      this.orderModel
        .find({
          astrologerId,
          reviewSubmitted: true,
          rating: { $gte: 1 }
        })
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments({
        astrologerId,
        reviewSubmitted: true,
        rating: { $gte: 1 }
      })
    ]);

    const formattedReviews = reviews.map(order => ({
      userName: (order.userId as any)?.name || 'Anonymous',
      userProfileImage: (order.userId as any)?.profileImage || 'default',
      rating: order.rating,
      review: order.review,
      serviceType: order.type,
      duration: order.actualDurationSeconds,
      reviewDate: order.endedAt,
      orderId: order.orderId
    }));

    const totalPages = Math.ceil(totalReviews / limit);

    return {
      reviews: formattedReviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  async getReviewStats(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // ✅ Get rating distribution from Order collection
    const ratingDistribution = await this.orderModel.aggregate([
      {
        $match: {
          astrologerId: astrologerId,
          reviewSubmitted: true,
          rating: { $gte: 1 }
        }
      },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]);

    return {
      averageRating: astrologer.ratings.average,
      totalReviews: astrologer.ratings.total,
      ratingDistribution,
      ratingBreakdown: astrologer.ratings.breakdown,
      stats: {
        totalOrders: astrologer.stats.totalOrders,
        totalMinutes: astrologer.stats.totalMinutes,
        totalEarnings: astrologer.stats.totalEarnings,
        repeatCustomers: astrologer.stats.repeatCustomers
      }
    };
  }
}
