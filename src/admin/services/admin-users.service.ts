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

    // Fix: Use 'status' instead of 'accountStatus'
    if (filters?.status) query.status = filters.status;
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
    // Validate status
    const validStatuses = ['active', 'suspended', 'blocked', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new NotFoundException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Fix: Update 'status' field instead of 'accountStatus'
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          status: status,
          updatedAt: new Date()
        } 
      },
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
    // Fix: Use 'status' instead of 'accountStatus'
    const [total, active, blocked, suspended, newThisMonth] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ status: 'active' }),
      this.userModel.countDocuments({ status: 'blocked' }),
      this.userModel.countDocuments({ status: 'suspended' }),
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
        suspended,
        newThisMonth,
      },
    };
  }
}
