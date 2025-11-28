// src/admin/features/user-management/services/admin-users.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from '../../../../users/schemas/user.schema';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../../../payments/schemas/wallet-transaction.schema';

import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { NotificationService } from '../../../../notifications/services/notification.service';
import { UserFilter } from '../interfaces/user-filter.interface';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Get all users with filters and pagination
   */
  async getAllUsers(page: number = 1, limit: number = 50, filters?: UserFilter): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Apply filters
    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.registrationMethod) {
      query.registrationMethod = filters.registrationMethod;
    }

    if (filters?.isPhoneVerified !== undefined) {
      query.isPhoneVerified = filters.isPhoneVerified;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phoneNumber: { $regex: filters.search, $options: 'i' } },
      ];
    }

    // Date range filter
    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -phoneHash -fcmTokens')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        users,
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
   * Get user details by ID
   */
  async getUserDetails(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('-password -phoneHash -fcmTokens')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get additional stats
    const [orderCount, totalSpent, lastOrder] = await Promise.all([
      this.orderModel.countDocuments({ userId: new Types.ObjectId(userId) }),
      this.orderModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .select('orderId type totalAmount status createdAt')
        .lean(),
    ]);

    return {
      success: true,
      data: {
        ...user,
        stats: {
          orderCount,
          totalSpent: totalSpent[0]?.total || 0,
          lastOrder,
        },
      },
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(startDate?: string, endDate?: string): Promise<any> {
    const matchQuery: any = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const [
      total,
      active,
      blocked,
      suspended,
      deleted,
      phoneVerified,
      newThisMonth,
      newToday,
      usersByRegistration,
    ] = await Promise.all([
      this.userModel.countDocuments(matchQuery),
      this.userModel.countDocuments({ ...matchQuery, status: 'active' }),
      this.userModel.countDocuments({ ...matchQuery, status: 'blocked' }),
      this.userModel.countDocuments({ ...matchQuery, status: 'suspended' }),
      this.userModel.countDocuments({ ...matchQuery, status: 'deleted' }),
      this.userModel.countDocuments({ ...matchQuery, isPhoneVerified: true }),
      this.userModel.countDocuments({
        createdAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      }),
      this.userModel.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      this.userModel.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$registrationMethod', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        blocked,
        suspended,
        deleted,
        phoneVerified,
        newThisMonth,
        newToday,
        usersByRegistration: usersByRegistration.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    };
  }

  /**
   * Get currently active users (online in last 5 minutes)
   */
  async getActiveUsers(): Promise<any> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const activeCount = await this.userModel.countDocuments({
      lastActiveAt: { $gte: fiveMinutesAgo },
      status: 'active',
    });

    return {
      success: true,
      data: {
        activeUsersCount: activeCount,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Search users
   */
  async searchUsers(query: string, page: number = 1, limit: number = 20): Promise<any> {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    const skip = (page - 1) * limit;

    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
      ],
    };

    const [users, total] = await Promise.all([
      this.userModel
        .find(searchQuery)
        .select('name phoneNumber profileImage status wallet createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(searchQuery),
    ]);

    return {
      success: true,
      data: {
        users,
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
   * Get user activity summary
   */
  async getUserActivity(userId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);

    const [orders, transactions, favoriteAstrologers] = await Promise.all([
      this.orderModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderId type totalAmount status createdAt')
        .lean(),
      this.transactionModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('transactionId type amount status createdAt')
        .lean(),
      this.userModel
        .findById(userId)
        .select('favoriteAstrologers')
        .populate('favoriteAstrologers', 'name profilePicture specializations')
        .lean(),
    ]);

    return {
      success: true,
      data: {
        recentOrders: orders,
        recentTransactions: transactions,
        favoriteAstrologers: favoriteAstrologers?.favoriteAstrologers || [],
      },
    };
  }

  /**
   * Get user wallet transactions
   */
  async getUserTransactions(userId: string, page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments({ userId: userObjectId }),
    ]);

    return {
      success: true,
      data: {
        transactions,
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
   * Get user orders
   */
  async getUserOrders(userId: string, page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    const [orders, total] = await Promise.all([
      this.orderModel
        .find({ userId: userObjectId })
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments({ userId: userObjectId }),
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
        },
      },
    };
  }

  /**
   * Update user status (block/unblock/suspend)
   */
  async updateUserStatus(
    userId: string,
    adminId: string,
    status: string,
    reason?: string,
  ): Promise<any> {
    const validStatuses = ['active', 'suspended', 'blocked', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldStatus = user.status;
    user.status = status as any;
    user.updatedAt = new Date();
    await user.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'user.status_updated',
      module: 'users',
      targetId: userId,
      targetType: 'User',
      status: 'success',
      details: {
        userName: user.name,
        reason,
      },
      changes: {
        before: { status: oldStatus },
        after: { status },
      },
    });

    // Send notification to user
    if (status === 'blocked' || status === 'suspended') {
      await this.notificationService.sendNotification({
        recipientId: userId,
        recipientModel: 'User',
        type: 'system_announcement',
        title: `Account ${status}`,
        message: `Your account has been ${status}. ${reason || 'Contact support for more information.'}`,
        priority: 'urgent',
      });
    }

    this.logger.log(`User ${userId} status updated to ${status} by admin ${adminId}`);

    return {
      success: true,
      message: `User status updated to ${status}`,
      data: {
        userId,
        name: user.name,
        oldStatus,
        newStatus: status,
      },
    };
  }

  /**
   * Adjust user wallet balance
   */
  async adjustWalletBalance(
    userId: string,
    adminId: string,
    amount: number,
    reason: string,
  ): Promise<any> {
    if (!amount || amount === 0) {
      throw new BadRequestException('Amount must be a non-zero number');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldBalance = user.wallet.balance;
    user.wallet.balance += amount;

    if (user.wallet.balance < 0) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    await user.save();

    // Create transaction record
    const transaction = new this.transactionModel({
      userId: new Types.ObjectId(userId),
      type: amount > 0 ? 'admin_credit' : 'admin_debit',
      amount: Math.abs(amount),
      status: 'completed',
      description: reason || 'Admin wallet adjustment',
      balanceBefore: oldBalance,
      balanceAfter: user.wallet.balance,
      metadata: {
        adjustedBy: adminId,
      },
    });

    await transaction.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'user.wallet_adjusted',
      module: 'users',
      targetId: userId,
      targetType: 'User',
      status: 'success',
      details: {
        userName: user.name,
        amount,
        reason,
        oldBalance,
        newBalance: user.wallet.balance,
      },
    });

    this.logger.log(`Wallet adjusted for user ${userId}: ${amount} (by admin ${adminId})`);

    return {
      success: true,
      message: 'Wallet balance adjusted successfully',
      data: {
        oldBalance,
        newBalance: user.wallet.balance,
        adjustment: amount,
        transactionId: transaction.transactionId,
      },
    };
  }

  /**
   * Soft delete user
   */
  async deleteUser(userId: string, adminId: string, reason?: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = 'deleted';
    user.updatedAt = new Date();
    await user.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'user.deleted',
      module: 'users',
      targetId: userId,
      targetType: 'User',
      status: 'success',
      details: {
        userName: user.name,
        phoneNumber: user.phoneNumber,
        reason,
      },
    });

    this.logger.log(`User ${userId} deleted by admin ${adminId}`);

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  /**
   * Restore soft-deleted user
   */
  async restoreUser(userId: string, adminId: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status !== 'deleted') {
      throw new BadRequestException('User is not deleted');
    }

    user.status = 'active';
    user.updatedAt = new Date();
    await user.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'user.restored',
      module: 'users',
      targetId: userId,
      targetType: 'User',
      status: 'success',
      details: {
        userName: user.name,
        phoneNumber: user.phoneNumber,
      },
    });

    this.logger.log(`User ${userId} restored by admin ${adminId}`);

    return {
      success: true,
      message: 'User restored successfully',
    };
  }

  /**
   * Export users to CSV
   */
  async exportUsersToCSV(status?: string): Promise<any> {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const users = await this.userModel
      .find(query)
      .select('name phoneNumber status wallet.balance createdAt')
      .lean();

    // Convert to CSV format
    const csvData = users.map(user => ({
      Name: user.name || 'N/A',
      PhoneNumber: user.phoneNumber,
      Status: user.status,
      WalletBalance: user.wallet?.balance || 0,
      RegisteredAt: user.createdAt,
    }));

    return {
      success: true,
      message: 'Users exported successfully',
      data: csvData,
      count: users.length,
    };
  }
}
