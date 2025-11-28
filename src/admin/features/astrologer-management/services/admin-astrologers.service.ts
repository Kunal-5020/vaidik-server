// src/admin/features/astrologer-management/services/admin-astrologers.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Astrologer, AstrologerDocument } from '../../../../astrologers/schemas/astrologer.schema';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { NotificationService } from '../../../../notifications/services/notification.service';
import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { AstrologerFilter } from '../interfaces/astrologer-filter.interface';
import { UpdatePricingDto } from '../dto/update-pricing.dto';

@Injectable()
export class AdminAstrologersService {
  private readonly logger = new Logger(AdminAstrologersService.name);

  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private notificationService: NotificationService,
    private activityLogService: AdminActivityLogService,
  ) {}

  /**
   * Get all astrologers with filters
   */
  async getAllAstrologers(
    page: number = 1,
    limit: number = 50,
    filters?: AstrologerFilter,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) {
      query.accountStatus = filters.status;
    }

    if (filters?.specialization) {
      query.specializations = { $in: [filters.specialization] };
    }

    if (filters?.isProfileComplete !== undefined) {
      query['profileCompletion.isComplete'] = filters.isProfileComplete;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phoneNumber: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find(query)
        .populate('registrationId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        astrologers,
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
   * Get pending astrologers (incomplete profiles)
   */
  async getPendingAstrologers(page: number = 1, limit: number = 50): Promise<any> {
    const skip = (page - 1) * limit;

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find({
          'profileCompletion.isComplete': false,
          accountStatus: 'active',
        })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments({
        'profileCompletion.isComplete': false,
        accountStatus: 'active',
      }),
    ]);

    return {
      success: true,
      data: {
        astrologers,
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
   * Get astrologer details
   */
  async getAstrologerDetails(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId')
      .populate('userId', 'name email phoneNumber wallet')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer,
    };
  }

  /**
   * Get astrologer statistics
   */
  async getAstrologerStats(): Promise<any> {
    const [total, active, pending, completed, blocked] = await Promise.all([
      this.astrologerModel.countDocuments(),
      this.astrologerModel.countDocuments({ accountStatus: 'active' }),
      this.astrologerModel.countDocuments({
        'profileCompletion.isComplete': false,
        accountStatus: 'active',
      }),
      this.astrologerModel.countDocuments({
        'profileCompletion.isComplete': true,
      }),
      this.astrologerModel.countDocuments({ accountStatus: 'blocked' }),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        pendingProfileCompletion: pending,
        profileCompleted: completed,
        blocked,
      },
    };
  }

  /**
   * Get top performing astrologers
   */
  async getTopPerformers(limit: number = 10): Promise<any> {
    const topAstrologers = await this.astrologerModel
      .find({ accountStatus: 'active' })
      .sort({ 'stats.totalEarnings': -1 })
      .limit(limit)
      .select('name profilePicture stats ratings experienceYears specializations')
      .lean();

    return {
      success: true,
      data: topAstrologers,
    };
  }

  /**
   * Get astrologer performance metrics
   */
  async getAstrologerPerformance(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId).lean();
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const astrologerObjectId = new Types.ObjectId(astrologerId);

    const [totalOrders, completedOrders, totalRevenue, avgRating, recentOrders] = await Promise.all([
      this.orderModel.countDocuments({ astrologerId: astrologerObjectId }),
      this.orderModel.countDocuments({
        astrologerId: astrologerObjectId,
        status: 'completed',
      }),
      this.orderModel.aggregate([
        { $match: { astrologerId: astrologerObjectId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel.aggregate([
        { $match: { astrologerId: astrologerObjectId, status: 'completed', 'rating.rating': { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating.rating' } } },
      ]),
      this.orderModel
        .find({ astrologerId: astrologerObjectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'name profileImage')
        .lean(),
    ]);

    return {
      success: true,
      data: {
        astrologer: {
          name: astrologer.name,
          profilePicture: astrologer.profilePicture,
          experienceYears: astrologer.experienceYears,
          specializations: astrologer.specializations,
        },
        performance: {
          totalOrders,
          completedOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          averageRating: avgRating[0]?.avg || 0,
          completionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0,
        },
        recentOrders,
      },
    };
  }

  /**
   * Update astrologer status
   */
  async updateAstrologerStatus(
    astrologerId: string,
    adminId: string,
    status: string,
    reason?: string,
  ): Promise<any> {
    const validStatuses = ['active', 'inactive', 'blocked', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const astrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: { accountStatus: status, updatedAt: new Date() } },
      { new: true },
    );

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.status_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: {
        name: astrologer.name,
        newStatus: status,
        reason,
      },
    });

    // Send notification
    await this.notificationService.sendNotification({
      recipientId: astrologerId,
      recipientModel: 'Astrologer',
      type: 'system_announcement',
      title: `Account ${status}`,
      message: `Your account status has been updated to ${status}. ${reason || ''}`,
      priority: 'high',
    });

    this.logger.log(`Astrologer ${astrologerId} status updated to ${status} by admin ${adminId}`);

    return {
      success: true,
      message: `Astrologer status updated to ${status}`,
      data: astrologer,
    };
  }

  /**
   * Update astrologer pricing
   */
  async updatePricing(
    astrologerId: string,
    adminId: string,
    pricingData: UpdatePricingDto,
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const oldPricing = { ...astrologer.pricing };

    // Update pricing
    if (pricingData.chatRatePerMinute !== undefined) {
      astrologer.pricing.chat = pricingData.chatRatePerMinute;
    }
    if (pricingData.callRatePerMinute !== undefined) {
      astrologer.pricing.call = pricingData.callRatePerMinute;
    }
    if (pricingData.videoCallRatePerMinute !== undefined) {
      astrologer.pricing.videoCall = pricingData.videoCallRatePerMinute;
    }

    await astrologer.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.pricing_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: pricingData,
      changes: {
        before: oldPricing,
        after: astrologer.pricing,
      },
    });

    this.logger.log(`Pricing updated for astrologer ${astrologerId} by admin ${adminId}`);

    return {
      success: true,
      message: 'Pricing updated successfully',
      data: astrologer.pricing,
    };
  }

  /**
   * Update astrologer bio
   */
  async updateBio(astrologerId: string, adminId: string, bio: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const oldBio = astrologer.bio;
    astrologer.bio = bio;
    await astrologer.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.bio_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      changes: {
        before: { bio: oldBio },
        after: { bio: bio },
      },
    });

    return {
      success: true,
      message: 'Bio updated successfully',
      data: { bio: astrologer.bio },
    };
  }

  /**
   * Toggle features (chat, call, livestream)
   */
  async toggleFeatures(
    astrologerId: string,
    adminId: string,
    features: {
      isChatEnabled?: boolean;
      isCallEnabled?: boolean;
      isLiveStreamEnabled?: boolean;
    },
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const oldFeatures = {
      isChatEnabled: astrologer.isChatEnabled,
      isCallEnabled: astrologer.isCallEnabled,
      isLiveStreamEnabled: astrologer.isLiveStreamEnabled,
    };

    if (features.isChatEnabled !== undefined) {
      astrologer.isChatEnabled = features.isChatEnabled;
    }
    if (features.isCallEnabled !== undefined) {
      astrologer.isCallEnabled = features.isCallEnabled;
    }
    if (features.isLiveStreamEnabled !== undefined) {
      astrologer.isLiveStreamEnabled = features.isLiveStreamEnabled;
    }

    await astrologer.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.features_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      changes: {
        before: oldFeatures,
        after: features,
      },
    });

    return {
      success: true,
      message: 'Features updated successfully',
      data: {
        isChatEnabled: astrologer.isChatEnabled,
        isCallEnabled: astrologer.isCallEnabled,
        isLiveStreamEnabled: astrologer.isLiveStreamEnabled,
      },
    };
  }

  /**
   * Soft delete astrologer
   */
  async deleteAstrologer(astrologerId: string, adminId: string, reason?: string): Promise<any> {
    const astrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: { accountStatus: 'deleted', updatedAt: new Date() } },
      { new: true },
    );

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.deleted',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: {
        name: astrologer.name,
        reason,
      },
    });

    return {
      success: true,
      message: 'Astrologer deleted successfully',
    };
  }
}
