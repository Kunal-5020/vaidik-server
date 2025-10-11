import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminActivityLog, AdminActivityLogDocument } from '../schemas/admin-activity-log.schema';

@Injectable()
export class AdminActivityLogService {
  constructor(
    @InjectModel(AdminActivityLog.name) private logModel: Model<AdminActivityLogDocument>,
  ) {}

  async log(logData: {
    adminId: string;
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
  }): Promise<void> {
    try {
      const log = new this.logModel({
        ...logData,
        status: logData.status || 'success',
        createdAt: new Date(),
      });
      await log.save();
    } catch (error) {
      console.error('Failed to log admin activity:', error);
    }
  }

  async getActivityLogs(
    filters?: {
      adminId?: string;
      action?: string;
      module?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page: number = 1,
    limit: number = 50
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.adminId) query.adminId = filters.adminId;
    if (filters?.action) query.action = { $regex: filters.action, $options: 'i' };
    if (filters?.module) query.module = filters.module;
    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

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
