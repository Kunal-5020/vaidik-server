// src/astrologers/controllers/astrologer-profile.controller.ts

import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Query,
  DefaultValuePipe,
  ParseIntPipe, // ✅ ADD THIS
} from '@nestjs/common';
import { Types } from 'mongoose'; // ✅ ADD THIS
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AstrologersService } from '../services/astrologers.service';
import { AstrologerService } from '../services/astrologer.service';
import { AvailabilityService } from '../services/availability.service';
import { ProfileChangeService } from '../services/profile-change.service';
import { EarningsService } from '../services/earnings.service';
import { PenaltyService } from '../services/penalty.service'; // ✅ ADD THIS
import { WalletService } from '../../payments/services/wallet.service'; // ✅ ADD THIS
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';
import { UpdateWorkingHoursDto } from '../dto/update-working-hours.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import { RequestProfileChangeDto } from '../dto/request-profile-change.dto';
import { GiftService } from '../../payments/services/gift.service'; 

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer')
@UseGuards(JwtAuthGuard)
export class AstrologerProfileController {
  constructor(
    private astrologersService: AstrologersService,
    private astrologerService: AstrologerService,
    private availabilityService: AvailabilityService,
    private profileChangeService: ProfileChangeService,
    private earningsService: EarningsService,
    private penaltyService: PenaltyService, // ✅ ADD THIS
    private walletService: WalletService, // ✅ ADD THIS
    private giftService: GiftService,
  ) {}

  // ===== PROFILE MANAGEMENT =====

  /**
   * ✅ NEW: Get complete profile with all details
   * GET /astrologer/profile/complete
   */
  @Get('profile/complete')
  async getCompleteProfile(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.getCompleteProfile(astrologerId);
  }

  /**
   * Get my profile (basic)
   * GET /astrologer/profile
   */
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.getOwnProfile(astrologerId);
  }

  /**
   * Get profile completion status
   * GET /astrologer/profile/completion
   */
  @Get('profile/completion')
  async getProfileCompletion(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.getProfileCompletionStatus(astrologerId);
  }

  /**
   * Update profile (minor changes)
   * PATCH /astrologer/profile
   */
  @Patch('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAstrologerProfileDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologersService.updateProfile(astrologerId, updateDto);
  }

  /**
   * Update pricing
   * PATCH /astrologer/profile/pricing
   */
  @Patch('profile/pricing')
  async updatePricing(
    @Req() req: AuthenticatedRequest,
    @Body() pricingData: { chat: number; call: number; videoCall?: number },
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.updatePricing(astrologerId, pricingData);
  }

  // ===== AVAILABILITY MANAGEMENT =====

  /**
   * Get availability/working hours
   * GET /astrologer/availability
   */
  @Get('availability')
  async getAvailability(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.getWorkingHours(astrologerId);
  }

  /**
   * Update working hours
   * PATCH /astrologer/profile/working-hours
   */
  @Patch('profile/working-hours')
  async updateWorkingHours(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateWorkingHoursDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateWorkingHours(astrologerId, updateDto);
  }

  /**
   * Update availability status
   * PATCH /astrologer/availability
   */
  @Patch('availability')
  async updateAvailability(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateAvailabilityDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.availabilityService.updateAvailability(astrologerId, updateDto);
  }

  /**
   * Toggle online status
   * POST /astrologer/status/online
   */
  @Post('status/online')
  @HttpCode(HttpStatus.OK)
  async toggleOnline(
    @Req() req: AuthenticatedRequest,
    @Body() body: { isOnline: boolean },
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.toggleOnlineStatus(astrologerId, body.isOnline);
  }

  /**
   * Toggle availability
   * POST /astrologer/status/available
   */
  @Post('status/available')
  @HttpCode(HttpStatus.OK)
  async toggleAvailability(
    @Req() req: AuthenticatedRequest,
    @Body() body: { isAvailable: boolean },
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.astrologerService.toggleAvailability(astrologerId, body.isAvailable);
  }

  // ===== PROFILE CHANGE REQUESTS =====

  /**
   * Request profile change (for major changes)
   * POST /astrologer/profile/change-request
   */
  @Post('profile/change-request')
  async requestProfileChange(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) requestDto: RequestProfileChangeDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.profileChangeService.requestChange(astrologerId, requestDto);
  }

  /**
   * Get my change requests
   * GET /astrologer/profile/change-requests
   */
  @Get('profile/change-requests')
  async getMyChangeRequests(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.profileChangeService.getMyChangeRequests(astrologerId);
  }

  // ===== EARNINGS =====

  /**
   * ✅ FIXED: Get comprehensive earnings dashboard
   * GET /astrologer/earnings/dashboard
   */
  @Get('earnings/dashboard')
  async getEarningsDashboard(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id; // ✅ FIXED

    const [astrologer, transactions, penalties] = await Promise.all([
      this.astrologersService.astrologerModel
        .findById(astrologerId)
        .select('name earnings stats ratings pricing')
        .lean(),
      this.walletService['transactionModel'] // ✅ FIXED: Access using bracket notation
        .find({
          userId: new Types.ObjectId(astrologerId),
          userModel: 'Astrologer',
          type: 'earning',
          status: 'completed',
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      this.penaltyService.getPenalties(astrologerId),
    ]);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Calculate revenue breakdown by service type
    const callRevenue = transactions
      .filter(
        (t: any) =>
          t.metadata?.sessionType === 'audio_call' || t.metadata?.sessionType === 'video_call',
      )
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const chatRevenue = transactions
      .filter((t: any) => t.metadata?.sessionType === 'chat')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const streamRevenue = transactions
      .filter((t: any) => t.metadata?.sessionType === 'stream_call')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    // Calculate weekly trend (last 7 days)
    const weeklyTrend: { date: string; earnings: number }[] = []; // ✅ FIXED: Add type
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayEarnings = transactions
        .filter((t: any) => {
          const tDate = new Date(t.createdAt);
          return tDate >= date && tDate < nextDate;
        })
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      weeklyTrend.push({
        date: date.toISOString().split('T')[0],
        earnings: dayEarnings,
      });
    }

    // Recent transactions (last 10)
    const recentTransactions = transactions.slice(0, 10).map((t: any) => ({
      transactionId: t.transactionId,
      amount: t.amount,
      type: t.metadata?.sessionType || 'unknown',
      userName: t.metadata?.userName || 'User',
      createdAt: t.createdAt,
    }));

    return {
      success: true,
      data: {
        // Summary
        summary: {
          totalEarned: astrologer.earnings.totalEarned || 0,
          platformCommission: astrologer.earnings.platformCommission || 0,
          platformCommissionRate: 40,
          netEarnings: astrologer.earnings.netEarnings || 0,
          totalPenalties: astrologer.earnings.totalPenalties || 0,
          withdrawableAmount: astrologer.earnings.withdrawableAmount || 0,
          totalWithdrawn: astrologer.earnings.totalWithdrawn || 0,
          pendingWithdrawal: astrologer.earnings.pendingWithdrawal || 0,
        },

        // Stats
        stats: {
          totalOrders: astrologer.stats.totalOrders || 0,
          callOrders: astrologer.stats.callOrders || 0,
          chatOrders: astrologer.stats.chatOrders || 0,
          totalMinutes: astrologer.stats.totalMinutes || 0,
          repeatCustomers: astrologer.stats.repeatCustomers || 0,
          averageRating: astrologer.ratings.average || 0,
        },

        // Revenue breakdown by service
        revenueBreakdown: {
          call: callRevenue,
          chat: chatRevenue,
          stream: streamRevenue,
          total: callRevenue + chatRevenue + streamRevenue,
        },

        // Weekly trend
        weeklyTrend,

        // Recent transactions
        recentTransactions,

        // Penalties
        penalties: penalties.data.penalties || [],
        totalPenaltyAmount: astrologer.earnings.totalPenalties || 0,

        // Pricing
        pricing: astrologer.pricing,
      },
    };
  }

  /**
   * ✅ Get earnings summary (simple endpoint)
   * GET /astrologer/earnings
   */
  @Get('earnings')
  async getEarnings(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id; // ✅ FIXED
    return this.earningsService.getEarningsSummary(astrologerId);
  }

  /**
   * ✅ Get stats (separate endpoint)
   * GET /astrologer/stats
   */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id; // ✅ FIXED
    return this.earningsService.getStats(astrologerId);
  }

   // ===== EARNINGS & TRANSACTIONS =====

  /**
   * ✅ NEW: Get all astrologer transactions (earnings from calls, chats, gifts, streams)
   * GET /astrologer/transactions
   */
  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string, // 'session_payment', 'gift', etc.
    @Query('sessionType') sessionType?: string, // 'audio_call', 'video_call', 'chat', 'stream_call'
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    const skip = (page - 1) * limit;

    const query: any = {
      userId: new Types.ObjectId(astrologerId),
      userModel: 'Astrologer',
      status: 'completed',
    };

    if (type) {
      query.type = type;
    }

    if (sessionType) {
      query.sessionType = sessionType;
    }

    const [transactions, total] = await Promise.all([
      this.walletService['transactionModel']
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.walletService['transactionModel'].countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        transactions: transactions.map((t: any) => ({
          transactionId: t.transactionId,
          type: t.type,
          amount: t.amount,
          grossAmount: t.grossAmount,
          platformCommission: t.platformCommission,
          netAmount: t.netAmount,
          description: t.description,
          sessionType: t.sessionType,
          sessionId: t.sessionId,
          orderId: t.orderId,
          relatedUserId: t.relatedUserId,
          userName: t.metadata?.userName,
          giftType: t.metadata?.giftType,
          context: t.metadata?.context,
          createdAt: t.createdAt,
        })),
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
   * ✅ NEW: Get transaction statistics breakdown
   * GET /astrologer/transactions/stats
   */
  @Get('transactions/stats')
  async getTransactionStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;

    const stats = await this.walletService['transactionModel'].aggregate([
      {
        $match: {
          userId: new Types.ObjectId(astrologerId),
          userModel: 'Astrologer',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalGross: { $sum: '$grossAmount' },
          totalCommission: { $sum: '$platformCommission' },
        },
      },
    ]);

    // Session type breakdown
    const sessionStats = await this.walletService['transactionModel'].aggregate([
      {
        $match: {
          userId: new Types.ObjectId(astrologerId),
          userModel: 'Astrologer',
          type: 'session_payment',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$sessionType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalGross: { $sum: '$grossAmount' },
        },
      },
    ]);

    return {
      success: true,
      data: {
        byType: stats.reduce((acc: any, stat: any) => {
          acc[stat._id] = {
            count: stat.count,
            totalAmount: stat.totalAmount,
            totalGross: stat.totalGross || 0,
            totalCommission: stat.totalCommission || 0,
          };
          return acc;
        }, {}),
        bySessionType: sessionStats.reduce((acc: any, stat: any) => {
          acc[stat._id] = {
            count: stat.count,
            totalAmount: stat.totalAmount,
            totalGross: stat.totalGross || 0,
          };
          return acc;
        }, {}),
      },
    };
  }

  /**
   * ✅ NEW: Get gift history (gifts received)
   * GET /astrologer/gifts/history
   */
  @Get('gifts/history')
  async getGiftHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('context') context?: 'direct' | 'stream',
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.giftService.getAstrologerGiftHistory(astrologerId, {
      page,
      limit,
      context,
    });
  }

  /**
   * ✅ NEW: Get gift statistics
   * GET /astrologer/gifts/stats
   */
  @Get('gifts/stats')
  async getGiftStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;

    const result = await this.giftService.getAstrologerGiftHistory(astrologerId, {
      page: 1,
      limit: 1000,
    });

    const totalGifts = result.data.gifts.length;
    const totalEarned = result.data.totalEarned;
    const directGifts = result.data.gifts.filter((g) => g.context === 'direct');
    const streamGifts = result.data.gifts.filter((g) => g.context === 'stream');

    return {
      success: true,
      data: {
        totalGifts,
        totalEarned,
        directGifts: {
          count: directGifts.length,
          amount: directGifts.reduce((sum, g) => sum + g.amount, 0),
        },
        streamGifts: {
          count: streamGifts.length,
          amount: streamGifts.reduce((sum, g) => sum + g.amount, 0),
        },
        topSenders: this.getTopSenders(result.data.gifts, 5),
        recentGifts: result.data.gifts.slice(0, 10),
      },
    };
  }

  /**
   * Helper: Get top gift senders
   */
  private getTopSenders(gifts: any[], limit: number) {
    const senderMap = new Map<string, { userId: string; userName: string; totalAmount: number; count: number }>();

    gifts.forEach((gift) => {
      const userId = gift.userId?.toString() || 'unknown';
      const existing = senderMap.get(userId);

      if (existing) {
        existing.totalAmount += gift.amount;
        existing.count += 1;
      } else {
        senderMap.set(userId, {
          userId: gift.userId,
          userName: gift.userName || 'User',
          totalAmount: gift.amount,
          count: 1,
        });
      }
    });

    return Array.from(senderMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
  }

}
