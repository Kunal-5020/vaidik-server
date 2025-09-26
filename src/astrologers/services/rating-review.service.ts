import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

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
  ) {}

  async addReview(reviewData: ReviewData): Promise<ReviewResult> {
    const { userId, astrologerId, orderId, rating, review, serviceType } = reviewData;

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
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

    // Check if user has already reviewed this order
    const existingOrderIndex = user.orders.findIndex(order => order.orderId === orderId);
    if (existingOrderIndex === -1) {
      throw new BadRequestException('Order not found for this user');
    }

    const existingOrder = user.orders[existingOrderIndex];
    
    // Check if order belongs to this astrologer
    if (existingOrder.astrologerId.toString() !== astrologerId) {
      throw new BadRequestException('Order does not belong to this astrologer');
    }

    // Check if order is completed
    if (existingOrder.status !== 'completed') {
      throw new BadRequestException('Can only review completed sessions');
    }

    // Check if already reviewed
    if (existingOrder.rating && existingOrder.rating > 0) {
      throw new BadRequestException('This session has already been reviewed');
    }

    try {
      // Update user's order with rating and review
      user.orders[existingOrderIndex].rating = rating;
      user.orders[existingOrderIndex].review = review || '';
      user.stats.totalRatings += 1;
      await user.save();

      // Update astrologer's ratings
      const currentRating = astrologer.stats.rating || 0;
      const currentTotal = astrologer.stats.totalRatings || 0;
      
      // Calculate new average rating
      const newTotalRatings = currentTotal + 1;
      const newAverageRating = ((currentRating * currentTotal) + rating) / newTotalRatings;

      // Update astrologer stats
      astrologer.stats.rating = Math.round(newAverageRating * 10) / 10; // Round to 1 decimal
      astrologer.stats.totalRatings = newTotalRatings;

      // Add to recent activity
      if (astrologer.recentOrders && astrologer.recentOrders.length >= 10) {
        astrologer.recentOrders = astrologer.recentOrders.slice(0, 9); // Keep only 9 most recent
      }

      astrologer.recentOrders.unshift({
        orderId: existingOrder.orderId,
        userId: user._id as import('mongoose').Types.ObjectId,
        type: serviceType,
        duration: existingOrder.duration,
        amount: existingOrder.totalAmount,
        completedAt: existingOrder.endTime || new Date()
      });

      await astrologer.save();

      console.log(`✅ Review added: ${rating}/5 for astrologer ${astrologer.name} (Order: ${orderId})`);

      return {
        success: true,
        message: 'Review submitted successfully',
        newRating: astrologer.stats.rating,
        totalReviews: astrologer.stats.totalRatings
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
    // Get all users who have reviewed this astrologer
    const skip = (page - 1) * limit;

    const reviews = await this.userModel.aggregate([
      {
        $match: {
          'orders': {
            $elemMatch: {
              astrologerId: astrologerId,
              rating: { $exists: true, $gte: 1 },
              status: 'completed'
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          profileImage: 1,
          orders: {
            $filter: {
              input: '$orders',
              as: 'order',
              cond: {
                $and: [
                  { $eq: ['$$order.astrologerId', astrologerId] },
                  { $gte: ['$$order.rating', 1] },
                  { $eq: ['$$order.status', 'completed'] }
                ]
              }
            }
          }
        }
      },
      {
        $unwind: '$orders'
      },
      {
        $project: {
          userName: '$name',
          userProfileImage: '$profileImage',
          rating: '$orders.rating',
          review: '$orders.review',
          serviceType: '$orders.type',
          duration: '$orders.duration',
          reviewDate: '$orders.endTime',
          orderId: '$orders.orderId'
        }
      },
      {
        $sort: { reviewDate: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    const totalReviews = await this.userModel.countDocuments({
      'orders': {
        $elemMatch: {
          astrologerId: astrologerId,
          rating: { $exists: true, $gte: 1 },
          status: 'completed'
        }
      }
    });

    const totalPages = Math.ceil(totalReviews / limit);

    return {
      reviews,
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

    // Get rating distribution
    const ratingDistribution = await this.userModel.aggregate([
      {
        $match: {
          'orders': {
            $elemMatch: {
              astrologerId: astrologerId,
              rating: { $exists: true, $gte: 1 },
              status: 'completed'
            }
          }
        }
      },
      {
        $unwind: '$orders'
      },
      {
        $match: {
          'orders.astrologerId': astrologerId,
          'orders.rating': { $gte: 1 },
          'orders.status': 'completed'
        }
      },
      {
        $group: {
          _id: '$orders.rating',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]);

    return {
      averageRating: astrologer.stats.rating,
      totalReviews: astrologer.stats.totalRatings,
      ratingDistribution,
      stats: {
        totalOrders: astrologer.stats.totalOrders,
        totalMinutes: astrologer.stats.totalMinutes,
        repeatCustomers: astrologer.stats.repeatCustomers
      }
    };
  }
}
