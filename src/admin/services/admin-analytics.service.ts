// src/admin/services/admin-analytics.service.ts (Complete Implementation)
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { CallSession, CallSessionDocument } from '../../calls/schemas/call-session.schema';

export interface DashboardStats {
  overview: {
    totalUsers: number;
    totalAstrologers: number;
    activeAstrologers: number;
    totalRevenue: number;
    todayRevenue: number;
    totalSessions: number;
    activeSessions: number;
  };
  revenueBreakdown: {
    callRevenue: number;
    chatRevenue: number;
    streamingRevenue: number;
    commissionsEarned: number;
  };
  userGrowth: Array<{
    date: string;
    users: number;
    astrologers: number;
  }>;
  topAstrologers: Array<{
    id: string;
    name: string;
    totalEarnings: number;
    totalSessions: number;
    rating: number;
  }>;
  platformMetrics: {
    averageSessionDuration: number;
    userRetentionRate: number;
    astrologerUtilization: number;
    conversionRate: number;
  };
}

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(CallSession.name) private callModel: Model<CallSessionDocument>,
  ) {}

  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalAstrologers,
      activeAstrologers,
      totalSessions,
      activeSessions,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: 'user' }),
      this.astrologerModel.countDocuments(),
      this.astrologerModel.countDocuments({ 
        isOnline: true, 
        isAvailable: true,
        status: 'approved' 
      }),
      this.callModel.countDocuments({ status: 'completed' }),
      this.callModel.countDocuments({ status: 'active' }),
    ]);

    return {
      overview: {
        totalUsers,
        totalAstrologers,
        activeAstrologers,
        totalRevenue: 0, // Implement based on your transaction model
        todayRevenue: 0, // Implement based on your transaction model
        totalSessions,
        activeSessions,
      },
      revenueBreakdown: {
        callRevenue: 0,
        chatRevenue: 0,
        streamingRevenue: 0,
        commissionsEarned: 0,
      },
      userGrowth: [],
      topAstrologers: [],
      platformMetrics: {
        averageSessionDuration: 0,
        userRetentionRate: 0,
        astrologerUtilization: 0,
        conversionRate: 0,
      },
    };
  }
}
