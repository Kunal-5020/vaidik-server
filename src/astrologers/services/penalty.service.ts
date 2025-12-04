// src/astrologers/services/penalty.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose'; // ✅ Import Types
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';

@Injectable()
export class PenaltyService {
  constructor(
    @InjectModel(Astrologer.name)
    private astrologerModel: Model<AstrologerDocument>,
  ) {}

  /**
   * Apply penalty to astrologer
   */
  async applyPenalty(data: {
    astrologerId: string;
    type: string;
    amount: number;
    reason: string;
    description?: string;
    orderId?: string;
    userId?: string;
    appliedBy: string;
  }): Promise<any> {
    const astrologer = await this.astrologerModel.findById(data.astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const penaltyId = `PEN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const penalty = {
      penaltyId,
      type: data.type,
      amount: data.amount,
      reason: data.reason,
      description: data.description,
      orderId: data.orderId,
      userId: data.userId ? new Types.ObjectId(data.userId) : undefined, // ✅ Convert to ObjectId
      status: 'applied' as const,
      appliedBy: new Types.ObjectId(data.appliedBy), // ✅ Convert to ObjectId
      appliedAt: new Date(),
      createdAt: new Date(),
    };

    astrologer.penalties.push(penalty as any); // ✅ Type assertion

    // Update total penalties
    const totalPenalties = astrologer.penalties
      .filter(p => p.status === 'applied')
      .reduce((sum, p) => sum + p.amount, 0);

    astrologer.earnings.totalPenalties = totalPenalties;

    // Recalculate withdrawable amount
    const netEarnings = astrologer.earnings.netEarnings || 0;
    const totalWithdrawn = astrologer.earnings.totalWithdrawn || 0;
    const pendingWithdrawal = astrologer.earnings.pendingWithdrawal || 0;

    astrologer.earnings.withdrawableAmount = Math.max(
      0,
      netEarnings - totalPenalties - totalWithdrawn - pendingWithdrawal
    );

    await astrologer.save();

    console.log(`⚠️ [Penalty] Applied ₹${data.amount} penalty to ${astrologer.name}`);

    return {
      success: true,
      message: 'Penalty applied successfully',
      data: penalty,
    };
  }

  /**
   * Waive penalty
   */
  async waivePenalty(
    astrologerId: string,
    penaltyId: string,
    waivedBy: string,
    waiverReason: string,
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const penalty = astrologer.penalties.find(p => p.penaltyId === penaltyId);

    if (!penalty) {
      throw new NotFoundException('Penalty not found');
    }

    penalty.status = 'waived';
    penalty.waivedBy = new Types.ObjectId(waivedBy) as any; // ✅ Convert to ObjectId
    penalty.waivedAt = new Date();
    penalty.waiverReason = waiverReason;

    // Recalculate total penalties
    const totalPenalties = astrologer.penalties
      .filter(p => p.status === 'applied')
      .reduce((sum, p) => sum + p.amount, 0);

    astrologer.earnings.totalPenalties = totalPenalties;

    // Recalculate withdrawable amount
    const netEarnings = astrologer.earnings.netEarnings || 0;
    const totalWithdrawn = astrologer.earnings.totalWithdrawn || 0;
    const pendingWithdrawal = astrologer.earnings.pendingWithdrawal || 0;

    astrologer.earnings.withdrawableAmount = Math.max(
      0,
      netEarnings - totalPenalties - totalWithdrawn - pendingWithdrawal
    );

    await astrologer.save();

    return {
      success: true,
      message: 'Penalty waived successfully',
    };
  }

  /**
   * Get astrologer penalties
   */
  async getPenalties(
    astrologerId: string,
    status?: string,
  ): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('penalties')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    let penalties = astrologer.penalties || [];

    if (status) {
      penalties = penalties.filter(p => p.status === status);
    }

    return {
      success: true,
      data: {
        penalties: penalties.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        total: penalties.length,
      },
    };
  }
}
