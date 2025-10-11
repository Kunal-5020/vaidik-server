import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getAllUsers(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; search?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.accountStatus = filters.status;
    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phoneNumber: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
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
        },
      },
    };
  }

  async getUserDetails(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: user,
    };
  }

  async updateUserStatus(userId: string, status: string): Promise<any> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { accountStatus: status } },
      { new: true }
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      message: `User status updated to ${status}`,
      data: user,
    };
  }

  async getUserStats(): Promise<any> {
    const [total, active, blocked, newThisMonth] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ accountStatus: 'active' }),
      this.userModel.countDocuments({ accountStatus: 'blocked' }),
      this.userModel.countDocuments({
        createdAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        blocked,
        newThisMonth,
      },
    };
  }
}
