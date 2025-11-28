import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  // ✅ Check if order belongs to this astrologer (compare ObjectIds properly)
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

  try {
    // ✅ Update order with rating and review (PENDING moderation)
    order.rating = rating;
    order.review = review || '';
    order.reviewSubmitted = true;
    order.reviewSubmittedAt = new Date();
    order.reviewModerationStatus = 'pending'; // ✅ NEW: Needs admin approval
    await order.save();

    // ✅ Update user stats
    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalRatings': 1 }
    });

    console.log(`✅ Review submitted (pending moderation): ${rating}/5 for astrologer ${astrologer.name} (Order: ${orderId})`);

    return {
      success: true,
      message: 'Review submitted successfully. It will be visible after admin approval.',
      newRating: astrologer.ratings.average,
      totalReviews: astrologer.ratings.total
    };

  } catch (error) {
    console.error('❌ Error adding review:', error);
    throw new BadRequestException('Failed to submit review. Please try again.');
  }
}

async updateAstrologerRatings(astrologerId: string): Promise<void> {
  const astrologer = await this.astrologerModel.findById(astrologerId);
  if (!astrologer) {
    throw new NotFoundException('Astrologer not found');
  }

  // Get all APPROVED reviews
  const approvedReviews = await this.orderModel.find({
    astrologerId: new Types.ObjectId(astrologerId),
    reviewSubmitted: true,
    reviewModerationStatus: 'approved',
    rating: { $gte: 1 }
  }).select('rating');

  const totalApproved = approvedReviews.length;

  if (totalApproved === 0) {
    astrologer.ratings.average = 0;
    astrologer.ratings.approvedReviews = 0;
    astrologer.ratings.breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    await astrologer.save();
    return;
  }

  // Calculate average from approved reviews only
  const sum = approvedReviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  const average = sum / totalApproved;

  // Calculate breakdown
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  approvedReviews.forEach(r => {
    const ratingKey = r.rating as 1 | 2 | 3 | 4 | 5;
    breakdown[ratingKey]++;
  });

  // Get total reviews (including pending)
  const totalReviews = await this.orderModel.countDocuments({
    astrologerId: new Types.ObjectId(astrologerId),
    reviewSubmitted: true,
    rating: { $gte: 1 }
  });

  astrologer.ratings.average = Math.round(average * 10) / 10;
  astrologer.ratings.total = totalReviews;
  astrologer.ratings.approvedReviews = totalApproved;
  astrologer.ratings.breakdown = breakdown;

  await astrologer.save();

  console.log(`✅ Astrologer ratings updated: ${astrologer.name} - ${astrologer.ratings.average}/5 (${totalApproved} approved, ${totalReviews} total)`);
}

  async getAstrologerReviews(
  astrologerId: string, 
  page: number = 1, 
  limit: number = 10
): Promise<any> {
  const skip = (page - 1) * limit;

  // ✅ Query from Order collection - ONLY APPROVED reviews
  const [reviews, totalReviews] = await Promise.all([
    this.orderModel
      .find({
        astrologerId: new Types.ObjectId(astrologerId),
        reviewSubmitted: true,
        reviewModerationStatus: 'approved', // ✅ Only show approved
        rating: { $gte: 1 }
      })
      .populate('userId', 'name profileImage')
      .sort({ reviewSubmittedAt: -1 }) // ✅ Sort by review date
      .skip(skip)
      .limit(limit)
      .lean(),
    this.orderModel.countDocuments({
      astrologerId: new Types.ObjectId(astrologerId),
      reviewSubmitted: true,
      reviewModerationStatus: 'approved',
      rating: { $gte: 1 }
    })
  ]);

  const formattedReviews = reviews.map(order => ({
    orderId: order.orderId,
    userName: (order.userId as any)?.name || 'Anonymous',
    userProfileImage: (order.userId as any)?.profileImage || 'default',
    rating: order.rating,
    review: order.review,
    serviceType: order.type,
    duration: order.actualDurationSeconds,
    reviewDate: order.reviewSubmittedAt,
    isEdited: order.reviewIsEdited || false,
    editedAt: order.reviewEditedAt
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
