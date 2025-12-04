import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PayoutRequest, PayoutRequestDocument } from '../schemas/payout-request.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { RequestPayoutDto } from '../dto/request-payout.dto';

@Injectable()
export class PayoutService {
  constructor(
    @InjectModel(PayoutRequest.name) 
    private payoutModel: Model<PayoutRequestDocument>,
    @InjectModel(Astrologer.name) 
    private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // ===== REQUEST PAYOUT =====

  async requestPayout(
    astrologerId: string,
    requestDto: RequestPayoutDto
  ): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Enforce 60% payout cap over total earnings
    const totalEarned = astrologer.earnings?.totalEarned || 0;
    const maxTotalPayout = totalEarned * 0.6;

    const completedPayouts = await this.payoutModel.aggregate([
      {
        $match: {
          astrologerId,
          status: 'completed',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const alreadyPaid = completedPayouts[0]?.total || 0;
    const remainingLimit = Math.max(0, maxTotalPayout - alreadyPaid);

    if (requestDto.amount > remainingLimit) {
      throw new BadRequestException(
        `Requested amount exceeds maximum withdrawable based on 60% rule. You can withdraw up to ₹${remainingLimit.toFixed(2)} right now.`,
      );
    }

    // Check if enough balance based on current withdrawableAmount
    if (astrologer.earnings.withdrawableAmount < requestDto.amount) {
      throw new BadRequestException('Insufficient withdrawable balance');
    }

    // Check minimum payout amount (e.g., ₹500)
    if (requestDto.amount < 500) {
      throw new BadRequestException('Minimum payout amount is ₹500');
    }

    // Check for pending payout requests
    const pendingPayout = await this.payoutModel.findOne({
      astrologerId,
      status: { $in: ['pending', 'approved', 'processing'] }
    });

    if (pendingPayout) {
      throw new BadRequestException('You already have a pending payout request');
    }

    const payoutId = `PAYOUT_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const payout = new this.payoutModel({
      payoutId,
      astrologerId,
      amount: requestDto.amount,
      status: 'pending',
      bankDetails: requestDto.bankDetails,
      createdAt: new Date()
    });

    await payout.save();

    return {
      success: true,
      message: 'Payout request submitted successfully',
      data: {
        payoutId: payout.payoutId,
        amount: payout.amount,
        status: payout.status
      }
    };
  }

  // ===== GET PAYOUT REQUESTS =====

// src/payouts/services/payout.service.ts

/**
 * Get payout requests with full details
 */
async getAstrologerPayouts(
  astrologerId: string,
  page: number = 1,
  limit: number = 20,
  status?: string
): Promise<any> {
  const skip = (page - 1) * limit;
  const query: any = { astrologerId };

  if (status) query.status = status;

  const [payouts, total] = await Promise.all([
    this.payoutModel
      .find(query)
      .populate('astrologerId', 'name phoneNumber email') // ✅ Add email
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.payoutModel.countDocuments(query)
  ]);

  return {
    success: true,
    data: {
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
}

/**
 * Get payout details with full bank info
 */
async getPayoutDetails(payoutId: string, astrologerId: string): Promise<any> {
  const payout = await this.payoutModel
    .findOne({ payoutId, astrologerId })
    .populate('astrologerId', 'name phoneNumber email') // ✅ Include email
    .lean();

  if (!payout) {
    throw new NotFoundException('Payout request not found');
  }

  return {
    success: true,
    data: payout
  };
}


  // ===== STATISTICS =====

  async getPayoutStats(astrologerId: string): Promise<any> {
  const astrologer = await this.astrologerModel
    .findById(astrologerId)
    .select('earnings penalties')
    .lean();

  if (!astrologer) {
    throw new NotFoundException('Astrologer not found');
  }

  const [totalPayouts, completedPayouts, pendingAmount] = await Promise.all([
    this.payoutModel.countDocuments({ astrologerId }),
    this.payoutModel.aggregate([
      { $match: { astrologerId: astrologerId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    this.payoutModel.aggregate([
      { 
        $match: { 
          astrologerId: astrologerId, 
          status: { $in: ['pending', 'approved', 'processing'] } 
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  const totalWithdrawn = completedPayouts[0]?.total || 0;
  const pendingWithdrawal = pendingAmount[0]?.total || 0;

  // ✅ Calculate earnings with penalties
  const totalEarned = astrologer.earnings?.totalEarned || 0;
  const platformCommissionRate = astrologer.earnings?.platformCommissionRate || 30;
  const platformCommission = (totalEarned * platformCommissionRate) / 100;
  
  // ✅ Calculate total applied penalties
  const appliedPenalties = astrologer.penalties
    ?.filter(p => p.status === 'applied')
    .reduce((sum, p) => sum + p.amount, 0) || 0;
  
  // Net earnings after commission
  const netEarnings = totalEarned - platformCommission;
  
  // ✅ Withdrawable = Net Earnings - Penalties - Withdrawn - Pending
  const withdrawableAmount = Math.max(
    0, 
    netEarnings - appliedPenalties - totalWithdrawn - pendingWithdrawal
  );

  // ✅ Update astrologer document
  await this.astrologerModel.findByIdAndUpdate(astrologerId, {
    'earnings.platformCommission': platformCommission,
    'earnings.netEarnings': netEarnings,
    'earnings.totalPenalties': appliedPenalties,
    'earnings.totalWithdrawn': totalWithdrawn,
    'earnings.pendingWithdrawal': pendingWithdrawal,
    'earnings.withdrawableAmount': withdrawableAmount,
    'earnings.lastUpdated': new Date(),
  });

  return {
    success: true,
    data: {
      totalEarned,
      platformCommission,
      platformCommissionRate,
      netEarnings,
      totalPenalties: appliedPenalties,
      withdrawableAmount,
      totalWithdrawn,
      pendingWithdrawal,
      totalPayoutRequests: totalPayouts,
      
      // ✅ Penalty breakdown
      penalties: {
        total: appliedPenalties,
        count: astrologer.penalties?.filter(p => p.status === 'applied').length || 0,
        pending: astrologer.penalties?.filter(p => p.status === 'pending').length || 0,
        waived: astrologer.penalties?.filter(p => p.status === 'waived').length || 0,
      }
    }
  };
}
}
