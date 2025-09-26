// src/admin/services/admin-users.service.ts (Fixed)
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CallSession, CallSessionDocument } from '../../calls/schemas/call-session.schema';

export interface GetUsersQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  status: string;
  walletBalance: number;
  totalSpent: number;
  sessionsCount: number;
  joinedAt: Date;
  lastActiveAt: Date | null;
  isVerified: boolean;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CallSession.name) private callModel: Model<CallSessionDocument>,
  ) {}

  async getUsers(query: GetUsersQuery) {
    const { page, limit, search, status } = query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = { role: 'user' };
    
    if (search) {
      filter.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('profile phone status wallet createdAt lastActiveAt isVerified')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    // Get additional data for each user
    const userSummaries: UserSummary[] = await Promise.all(
      users.map(async (user) => {
        const sessionsCount = await this.getSessionsCount(user._id.toString());

        return {
          id: user._id.toString(),
          name: (user as any).profile?.name || 'Unknown',
          phone: (user as any).phone || '',
          status: (user as any).status || 'active',
          walletBalance: (user as any).wallet?.balance || 0,
          totalSpent: 0, // Implement when wallet transactions are available
          sessionsCount,
          joinedAt: user.createdAt || new Date(),
          lastActiveAt: (user as any).lastActiveAt || null,
          isVerified: (user as any).isVerified || false,
        };
      })
    );

    return {
      users: userSummaries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sessionsCount = await this.getSessionsCount(userId);

    return {
      user: {
        id: user._id,
        name: (user as any).profile?.name,
        phone: (user as any).phone,
        email: (user as any).profile?.email,
        gender: (user as any).profile?.gender,
        dateOfBirth: (user as any).profile?.dateOfBirth,
        birthPlace: (user as any).profile?.birthPlace,
        currentAddress: (user as any).profile?.currentAddress,
        profileImage: (user as any).profile?.profileImage,
        status: (user as any).status,
        isVerified: (user as any).isVerified,
        joinedAt: user.createdAt,
        lastActiveAt: (user as any).lastActiveAt,
      },
      wallet: {
        balance: (user as any).wallet?.balance || 0,
        totalSpent: 0,
        totalRecharged: 0,
      },
      statistics: {
        sessionsCount,
        messagesCount: 0,
        averageSessionDuration: 0,
        favoriteAstrologers: [],
      },
    };
  }

  async suspendUser(userId: string, reason: string, adminId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if ((user as any).status === 'suspended') {
      throw new BadRequestException('User is already suspended');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      status: 'suspended',
      suspensionReason: reason,
      suspendedAt: new Date(),
      suspendedBy: adminId,
    });

    return { message: 'User suspended successfully' };
  }

  async activateUser(userId: string, adminId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if ((user as any).status === 'active') {
      throw new BadRequestException('User is already active');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      status: 'active',
      $unset: {
        suspensionReason: '',
        suspendedAt: '',
        suspendedBy: '',
      },
    });

    return { message: 'User activated successfully' };
  }

  async deleteUser(userId: string, adminId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has active sessions
    const activeSessions = await this.callModel.countDocuments({
      userId,
      status: 'active',
    });

    if (activeSessions > 0) {
      throw new BadRequestException('Cannot delete user with active sessions');
    }

    // Soft delete - mark as deleted
    await this.userModel.findByIdAndUpdate(userId, {
      status: 'deleted',
      deletedAt: new Date(),
      deletedBy: adminId,
    });

    return { message: 'User deleted successfully' };
  }

  async getUserTransactions(userId: string) {
    // Return empty array for now - implement when transaction model is available
    return [];
  }

  // Private helper methods
  private async getSessionsCount(userId: string): Promise<number> {
    return this.callModel.countDocuments({ userId, status: 'completed' });
  }
}
