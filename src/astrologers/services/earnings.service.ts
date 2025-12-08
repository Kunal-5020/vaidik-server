// src/astrologers/services/earnings.service.ts

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  /**
   * ✅ FIXED: Update earnings correctly with 40% platform commission
   * @param astrologerId - Astrologer ID
   * @param grossAmount - GROSS amount (user charged amount)
   * @param sessionType - 'call' or 'chat'
   */
  async updateEarnings(
    astrologerId: string,
    grossAmount: number,
    sessionType: 'call' | 'chat',
  ): Promise<void> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // ✅ Platform takes 40%, Astrologer gets 60%
    const commissionRate = 40;
    const commission = (grossAmount * commissionRate) / 100;
    const netEarnings = grossAmount - commission; // 60% to astrologer

    // Calculate minutes
    const durationMinutes = sessionType === 'call' ? Math.ceil(grossAmount / (astrologer.pricing.call || 1)) : 0;

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $inc: {
        'earnings.totalEarned': grossAmount, // Total revenue generated
        'earnings.platformCommission': commission, // Platform's 40%
        'earnings.netEarnings': netEarnings, // Astrologer's 60%
        'earnings.withdrawableAmount': netEarnings, // Available to withdraw
        'stats.totalEarnings': netEarnings, // Legacy field
        'stats.totalOrders': 1,
        'stats.totalMinutes': durationMinutes || 0,
        ...(sessionType === 'call' && { 'stats.callOrders': 1 }),
        ...(sessionType === 'chat' && { 'stats.chatOrders': 1 }),
      },
      $set: {
        'earnings.lastUpdated': new Date(),
      },
    });

    this.logger.log(
      `✅ Earnings updated: Astrologer ${astrologerId} | Gross: ₹${grossAmount} | Commission: ₹${commission.toFixed(2)} (${commissionRate}%) | Net: ₹${netEarnings.toFixed(2)}`,
    );
  }

  /**
   * Record gift earnings
   */
  async recordGiftEarning(astrologerId: string, amount: number): Promise<void> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const commissionRate = 40;
    const commission = (amount * commissionRate) / 100;
    const astrologerEarning = amount - commission;

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $inc: {
        'earnings.totalEarned': amount,
        'earnings.platformCommission': commission,
        'earnings.netEarnings': astrologerEarning,
        'earnings.withdrawableAmount': astrologerEarning,
        'stats.totalEarnings': astrologerEarning,
      },
      $set: {
        'earnings.lastUpdated': new Date(),
      },
    });
  }

  /**
   * Get earnings summary
   */
  async getEarningsSummary(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('earnings stats')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        totalEarned: astrologer.earnings.totalEarned || 0,
        platformCommission: astrologer.earnings.platformCommission || 0,
        platformCommissionRate: 40,
        netEarnings: astrologer.earnings.netEarnings || 0,
        totalPenalties: astrologer.earnings.totalPenalties || 0,
        withdrawableAmount: astrologer.earnings.withdrawableAmount || 0,
        totalWithdrawn: astrologer.earnings.totalWithdrawn || 0,
        pendingWithdrawal: astrologer.earnings.pendingWithdrawal || 0,
        lastUpdated: astrologer.earnings.lastUpdated,
      },
    };
  }

  /**
   * Get stats
   */
  async getStats(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('stats')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: {
        totalOrders: astrologer.stats.totalOrders || 0,
        callOrders: astrologer.stats.callOrders || 0,
        chatOrders: astrologer.stats.chatOrders || 0,
        totalMinutes: astrologer.stats.totalMinutes || 0,
        repeatCustomers: astrologer.stats.repeatCustomers || 0,
        totalEarnings: astrologer.stats.totalEarnings || 0,
      },
    };
  }
}
