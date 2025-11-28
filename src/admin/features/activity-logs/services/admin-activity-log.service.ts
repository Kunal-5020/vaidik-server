// src/admin/features/activity-logs/services/admin-activity-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminActivityLog, AdminActivityLogDocument } from '../../../core/schemas/admin-activity-log.schema';
import { ActivityLogFilter } from '../interfaces/activity-log-filter.interface';

@Injectable()
export class AdminActivityLogService {
  private readonly logger = new Logger(AdminActivityLogService.name);

  constructor(
    @InjectModel(AdminActivityLog.name) private logModel: Model<AdminActivityLogDocument>,
  ) {}

  /**
   * Log an activity
   */
  async log(logData: {
    adminId?: string;
    action: string;
    module: string;
    targetId?: string;
    targetType?: string;
    details?: Record<string, any>;
    changes?: { before?: any; after?: any };
    ipAddress?: string;
    userAgent?: string;
    status?: 'success' | 'failed' | 'warning';
    errorMessage?: string;
  }): Promise<AdminActivityLogDocument | null> {
    try {
      // Skip logging if no adminId (system actions)
      if (!logData.adminId) {
        this.logger.warn(`Skipping activity log - no adminId provided for action: ${logData.action}`);
        return null;
      }

      const log = new this.logModel({
        ...logData,
        status: logData.status || 'success',
        createdAt: new Date(),
      });

      const savedLog = await log.save();
      
      this.logger.debug(
        `Activity logged: ${logData.action} by ${logData.adminId} - Status: ${logData.status || 'success'}`
      );

      return savedLog;
    } catch (error) {
      this.logger.error(`Failed to log activity: ${error.message}`, error.stack);
      return null; // Don't throw error - logging failure shouldn't break the main flow
    }
  }

  /**
   * Get activity logs with filters and pagination
   */
  async getActivityLogs(
    filters?: ActivityLogFilter,
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Build query
    if (filters?.adminId) {
      query.adminId = filters.adminId;
    }

    if (filters?.action) {
      query.action = { $regex: filters.action, $options: 'i' };
    }

    if (filters?.module) {
      query.module = filters.module;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.targetType) {
      query.targetType = filters.targetType;
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

    // Execute query with pagination
    const [logs, total] = await Promise.all([
      this.logModel
        .find(query)
        .populate('adminId', 'name email adminId roleType')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        logs,
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
   * Get activity statistics
   */
  async getActivityStats(filters?: ActivityLogFilter): Promise<any> {
    const query: any = {};

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

    const [
      totalLogs,
      successfulLogs,
      failedLogs,
      warningLogs,
      logsByModule,
      logsByAction,
      topAdmins,
    ] = await Promise.all([
      this.logModel.countDocuments(query),
      this.logModel.countDocuments({ ...query, status: 'success' }),
      this.logModel.countDocuments({ ...query, status: 'failed' }),
      this.logModel.countDocuments({ ...query, status: 'warning' }),
      
      // Group by module
      this.logModel.aggregate([
        { $match: query },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      
      // Group by action
      this.logModel.aggregate([
        { $match: query },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      
      // Top active admins
      this.logModel.aggregate([
        { $match: query },
        { $group: { _id: '$adminId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'adminDetails',
          },
        },
        { $unwind: '$adminDetails' },
        {
          $project: {
            adminId: '$adminDetails.adminId',
            name: '$adminDetails.name',
            email: '$adminDetails.email',
            count: 1,
          },
        },
      ]),
    ]);

    return {
      success: true,
      data: {
        summary: {
          total: totalLogs,
          successful: successfulLogs,
          failed: failedLogs,
          warnings: warningLogs,
          successRate: totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(2) : 0,
        },
        byModule: logsByModule,
        byAction: logsByAction,
        topAdmins,
      },
    };
  }

  /**
   * Get activity logs by admin ID
   */
  async getLogsByAdmin(adminId: string, page: number = 1, limit: number = 50): Promise<any> {
    return this.getActivityLogs({ adminId }, page, limit);
  }

  /**
   * Get activity logs by module
   */
  async getLogsByModule(module: string, page: number = 1, limit: number = 50): Promise<any> {
    return this.getActivityLogs({ module }, page, limit);
  }

  /**
   * Get failed activity logs
   */
  async getFailedLogs(page: number = 1, limit: number = 50): Promise<any> {
    return this.getActivityLogs({ status: 'failed' }, page, limit);
  }

  /**
   * Delete old logs (cleanup job - run via cron)
   */
  async deleteOldLogs(daysToKeep: number = 90): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.logModel.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    this.logger.log(`Deleted ${result.deletedCount} old activity logs (older than ${daysToKeep} days)`);

    return { deletedCount: result.deletedCount };
  }

  /**
   * Get recent activities (last 24 hours)
   */
  async getRecentActivities(limit: number = 20): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return this.getActivityLogs({ startDate: oneDayAgo }, 1, limit);
  }

  /**
   * Search activity logs
   */
  async searchLogs(searchTerm: string, page: number = 1, limit: number = 50): Promise<any> {
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { action: { $regex: searchTerm, $options: 'i' } },
        { module: { $regex: searchTerm, $options: 'i' } },
        { targetId: { $regex: searchTerm, $options: 'i' } },
        { 'details.email': { $regex: searchTerm, $options: 'i' } },
      ],
    };

    const [logs, total] = await Promise.all([
      this.logModel
        .find(query)
        .populate('adminId', 'name email adminId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}
