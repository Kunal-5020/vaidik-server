import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';

@Injectable()
export class EarningsService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  async updateEarnings(
    astrologerId: string,
    amount: number,
    sessionType: 'call' | 'chat'
  ): Promise<void> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const commissionRate = astrologer.earnings.platformCommission || 20;
    const commission = (amount * commissionRate) / 100;
    const astrologerEarning = amount - commission;

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $inc: {
        'earnings.totalEarned': astrologerEarning,
        'earnings.withdrawableAmount': astrologerEarning,
        'stats.totalEarnings': astrologerEarning,
        'stats.totalOrders': 1,
        ...(sessionType === 'call' && { 'stats.callOrders': 1 }),
        ...(sessionType === 'chat' && { 'stats.chatOrders': 1 })
      }
    });
  }

  async recordGiftEarning(
    astrologerId: string,
    amount: number,
  ): Promise<void> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const commissionRate = astrologer.earnings.platformCommission || 20;
    const commission = (amount * commissionRate) / 100;
    const astrologerEarning = amount - commission;

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $inc: {
        'earnings.totalEarned': astrologerEarning,
        'earnings.withdrawableAmount': astrologerEarning,
        'stats.totalEarnings': astrologerEarning,
      },
    });
  }

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
        totalEarned: astrologer.earnings.totalEarned,
        withdrawableAmount: astrologer.earnings.withdrawableAmount,
        platformCommission: astrologer.earnings.platformCommission,
        stats: astrologer.stats
      }
    };
  }

  async updateStats(
    astrologerId: string,
    updates: {
      incrementSessions?: number;
      addMinutes?: number;
      incrementRatings?: number;
    }
  ): Promise<void> {
    const updateFields: any = {};

    if (updates.incrementSessions) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalSessions': updates.incrementSessions };
    }
    if (updates.addMinutes) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalMinutes': updates.addMinutes };
    }
    if (updates.incrementRatings) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalRatings': updates.incrementRatings };
    }

    if (Object.keys(updateFields).length > 0) {
      await this.astrologerModel.findByIdAndUpdate(astrologerId, updateFields);
    }
  }
}
