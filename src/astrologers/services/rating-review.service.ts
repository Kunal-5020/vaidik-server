// src/astrologers/services/rating-review.service.ts

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';

export interface ReviewData {
  userId: string;
  astrologerId: string;
  orderId: string;
  rating: number;
  reviewText?: string;
  serviceType: 'chat' | 'call' | 'video_call';
}

export interface ReviewResult {
  success: boolean;
  message: string;
  reviewId?: string;
  newRating?: number;
  totalReviews?: number;
}

@Injectable()
export class RatingReviewService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  /**
   * ✅ ADD REVIEW (Create in separate Review collection)
   */
  async addReview(reviewData: ReviewData): Promise<ReviewResult> {
    const { userId, astrologerId, orderId, rating, reviewText, serviceType } = reviewData;

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // ✅ Find the order
    const order = await this.orderModel.findOne({ orderId, userId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // ✅ Verify order belongs to astrologer
    if (order.astrologerId.toString() !== astrologerId) {
      throw new BadRequestException('Order does not belong to this astrologer');
    }

    // Check if order is completed
    if (order.status !== 'completed') {
      throw new BadRequestException('Can only review completed sessions');
    }

    // Check if already reviewed
    if (order.reviewSubmitted) {
      throw new BadRequestException('This session has already been reviewed');
    }

    // Find the astrologer
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    try {
      // ✅ Generate review ID
      const reviewId = `REV_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

      // ✅ Create review document
      const review = new this.reviewModel({
        reviewId,
        userId: new Types.ObjectId(userId),
        astrologerId: new Types.ObjectId(astrologerId),
        orderId,
        rating,
        reviewText: reviewText || '',
        serviceType,
        sessionDuration: order.actualDurationSeconds,
        moderationStatus: 'pending', // ✅ Needs admin approval
        createdAt: new Date(),
      });

      await review.save();

      // ✅ Update order (only flag)
      order.reviewSubmitted = true;
      order.reviewSubmittedAt = new Date();
      order.review = reviewId;
      await order.save();

      // ✅ Update user stats
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: { 'stats.totalRatings': 1 }
      });

      // ✅ Recalculate astrologer ratings (async)
      this.updateAstrologerRatings(astrologerId).catch(err => 
        console.error('Failed to update ratings:', err)
      );

      console.log(`✅ Review submitted (pending moderation): ${rating}/5 for astrologer ${astrologer.name} (Order: ${orderId})`);

      return {
        success: true,
        message: 'Review submitted successfully. It will be visible after admin approval.',
        reviewId,
        newRating: astrologer.ratings.average,
        totalReviews: astrologer.ratings.total
      };

    } catch (error) {
      console.error('❌ Error adding review:', error);
      throw new BadRequestException('Failed to submit review. Please try again.');
    }
  }

  /**
   * ✅ UPDATE ASTROLOGER RATINGS (Calculate from approved reviews only)
   */
  async updateAstrologerRatings(astrologerId: string): Promise<void> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // ✅ Get all APPROVED reviews from Review collection
    const approvedReviews = await this.reviewModel.find({
      astrologerId: new Types.ObjectId(astrologerId),
      moderationStatus: 'approved',
      isDeleted: false
    }).select('rating');

    const totalApproved = approvedReviews.length;

    if (totalApproved === 0) {
      astrologer.ratings.average = 0;
      astrologer.ratings.approvedReviews = 0;
      astrologer.ratings.breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      await astrologer.save();
      return;
    }

    // Calculate average from approved reviews
    const sum = approvedReviews.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / totalApproved;

    // Calculate breakdown
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    approvedReviews.forEach(r => {
      const ratingKey = r.rating as 1 | 2 | 3 | 4 | 5;
      breakdown[ratingKey]++;
    });

    // ✅ Get total reviews (including pending)
    const totalReviews = await this.reviewModel.countDocuments({
      astrologerId: new Types.ObjectId(astrologerId),
      isDeleted: false
    });

    astrologer.ratings.average = Math.round(average * 10) / 10;
    astrologer.ratings.total = totalReviews;
    astrologer.ratings.approvedReviews = totalApproved;
    astrologer.ratings.breakdown = breakdown;

    await astrologer.save();

    console.log(`✅ Astrologer ratings updated: ${astrologer.name} - ${astrologer.ratings.average}/5 (${totalApproved} approved, ${totalReviews} total)`);
  }

  /**
   * ✅ GET ASTROLOGER REVIEWS (Paginated, approved only for public)
   */
  async getAstrologerReviews(
    astrologerId: string, 
    page: number = 1, 
    limit: number = 10,
    includeAll: boolean = false // Admin can see all
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const query: any = {
      astrologerId: new Types.ObjectId(astrologerId),
      isDeleted: false
    };

    // ✅ Public users only see approved
    if (!includeAll) {
      query.moderationStatus = 'approved';
    }

    const [reviews, totalReviews] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reviewModel.countDocuments(query)
    ]);

    const formattedReviews = reviews.map(review => ({
      reviewId: review.reviewId,
      orderId: review.orderId,
      userName: (review.userId as any)?.name || 'Anonymous',
      userProfileImage: (review.userId as any)?.profileImage || null,
      rating: review.rating,
      reviewText: review.reviewText,
      serviceType: review.serviceType,
      duration: review.sessionDuration,
      reviewDate: review.createdAt,
      isEdited: review.isEdited,
      editedAt: review.editedAt,
      moderationStatus: review.moderationStatus // Only visible to admin
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

  /**
   * ✅ GET REVIEW STATS (Rating distribution)
   */
  async getReviewStats(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      averageRating: astrologer.ratings.average,
      totalReviews: astrologer.ratings.total,
      approvedReviews: astrologer.ratings.approvedReviews,
      ratingBreakdown: astrologer.ratings.breakdown,
      stats: {
        totalOrders: astrologer.stats.totalOrders,
        totalMinutes: astrologer.stats.totalMinutes,
        totalEarnings: astrologer.stats.totalEarnings,
        repeatCustomers: astrologer.stats.repeatCustomers
      }
    };
  }

  /**
   * ✅ MODERATE REVIEW (Admin only)
   */
  async moderateReview(
    reviewId: string,
    moderationStatus: 'approved' | 'rejected' | 'flagged',
    moderatedBy: string,
    reason?: string
  ): Promise<any> {
    const review = await this.reviewModel.findOne({ reviewId });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.moderationStatus = moderationStatus;
    review.moderatedBy = new Types.ObjectId(moderatedBy);
    review.moderatedAt = new Date();
    if (reason) {
      review.moderationReason = reason;
    }

    await review.save();

    // ✅ Recalculate astrologer ratings
    await this.updateAstrologerRatings(review.astrologerId.toString());

    return {
      success: true,
      message: `Review ${moderationStatus}`,
      reviewId: review.reviewId
    };
  }

  /**
   * ✅ EDIT REVIEW (User can edit their review)
   */
  async editReview(
    reviewId: string,
    userId: string,
    updates: { rating?: number; reviewText?: string }
  ): Promise<any> {
    const review = await this.reviewModel.findOne({ 
      reviewId, 
      userId: new Types.ObjectId(userId)
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (updates.rating) {
      if (updates.rating < 1 || updates.rating > 5) {
        throw new BadRequestException('Rating must be between 1 and 5');
      }
      review.rating = updates.rating;
    }

    if (updates.reviewText !== undefined) {
      review.reviewText = updates.reviewText;
    }

    review.isEdited = true;
    review.editedAt = new Date();
    review.moderationStatus = 'pending'; // ✅ Re-moderate after edit

    await review.save();

    // ✅ Recalculate ratings (will exclude this review until re-approved)
    await this.updateAstrologerRatings(review.astrologerId.toString());

    return {
      success: true,
      message: 'Review updated. It will be reviewed by admin again.',
      reviewId: review.reviewId
    };
  }

  /**
   * ✅ DELETE REVIEW (Soft delete)
   */
  async deleteReview(reviewId: string, userId: string): Promise<any> {
    const review = await this.reviewModel.findOne({ 
      reviewId, 
      userId: new Types.ObjectId(userId)
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.isDeleted = true;
    review.deletedAt = new Date();
    await review.save();

    // ✅ Update order flag
    await this.orderModel.updateOne(
      { orderId: review.orderId },
      { 
        $set: { 
          reviewSubmitted: false,
          reviewId: null
        } 
      }
    );

    // ✅ Recalculate ratings
    await this.updateAstrologerRatings(review.astrologerId.toString());

    return {
      success: true,
      message: 'Review deleted successfully'
    };
  }
}
