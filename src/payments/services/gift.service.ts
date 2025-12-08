// src/payments/services/gift.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WalletService } from './wallet.service';
import { EarningsService } from '../../astrologers/services/earnings.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { StreamSession, StreamSessionDocument } from '../../streaming/schemas/stream-session.schema';
import { WalletTransaction, WalletTransactionDocument } from '../schemas/wallet-transaction.schema';

export type GiftContext = 'direct' | 'stream';

interface SendGiftParams {
  userId: string;
  astrologerId?: string;
  amount: number;
  giftType: string;
  context: GiftContext;
  streamId?: string;
}

@Injectable()
export class GiftService {
  private readonly logger = new Logger(GiftService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly earningsService: EarningsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private readonly astrologerModel: Model<AstrologerDocument>,
    @InjectModel(StreamSession.name) private readonly streamModel: Model<StreamSessionDocument>,
    @InjectModel(WalletTransaction.name) private readonly transactionModel: Model<WalletTransactionDocument>,
  ) {}

  /**
   * ✅ FIXED: Send gift with unified transaction tracking
   */
  async sendGift(params: SendGiftParams): Promise<{
    success: boolean;
    transactionId: string;
    newBalance: number;
    astrologerId: string;
    astrologerName: string;
    astrologerEarning: number;
    platformCommission: number;
    streamId?: string;
  }> {
    const { userId, amount, giftType, context } = params;

    // Validate amount
    if (!amount || amount <= 0) {
      throw new BadRequestException('Gift amount must be greater than zero');
    }

    let astrologerId = params.astrologerId;
    let streamId = params.streamId;

    // If stream gift, get astrologer from stream
    if (context === 'stream') {
      if (!streamId) {
        throw new BadRequestException('Stream ID is required for livestream gifts');
      }

      const stream = await this.streamModel.findOne({ streamId });
      if (!stream) {
        throw new NotFoundException('Stream not found');
      }
      if (stream.status !== 'live') {
        throw new BadRequestException('Stream is not live');
      }

      astrologerId = stream.hostId.toString();
    }

    if (!astrologerId) {
      throw new BadRequestException('Astrologer ID is required for direct gifts');
    }

    // Get user and astrologer details
    const [user, astrologer] = await Promise.all([
      this.userModel.findById(userId).select('name wallet'),
      this.astrologerModel.findById(astrologerId).select('name earnings'),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // ✅ Check user balance
    const totalAvailable = (user.wallet?.cashBalance || 0) + (user.wallet?.bonusBalance || 0);
    if (totalAvailable < amount) {
      throw new BadRequestException(
        `Insufficient balance. Required: ₹${amount}, Available: ₹${totalAvailable}`,
      );
    }

    const astrologerName = astrologer.name || 'Astrologer';
    const userName = user.name || 'User';

    // ✅ Calculate commission (40% platform, 60% astrologer)
    const platformCommission = (amount * 40) / 100;
    const astrologerEarning = amount - platformCommission;

    // ✅ Generate descriptions
    let userDescription = '';
    let astrologerDescription = '';

    if (context === 'stream') {
      userDescription = `Gift in livestream to ${astrologerName}`;
      astrologerDescription = `Gift from ${userName} in livestream`;
    } else {
      userDescription = `Gift to ${astrologerName}`;
      astrologerDescription = `Gift from ${userName}`;
    }

    // ✅ Start MongoDB session
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      // Deduct from user wallet
      const beforeBalance = user.wallet?.balance || 0;
      
      // Apply debit (bonus first, then cash)
      const bonusAvailable = user.wallet?.bonusBalance || 0;
      const bonusDebited = Math.min(bonusAvailable, amount);
      const cashDebited = amount - bonusDebited;

      user.wallet.bonusBalance = bonusAvailable - bonusDebited;
      user.wallet.cashBalance = (user.wallet?.cashBalance || 0) - cashDebited;
      user.wallet.balance = (user.wallet?.cashBalance || 0) + (user.wallet?.bonusBalance || 0);
      user.wallet.lastTransactionAt = new Date();

      // Generate transaction IDs
      const userTransactionId = this.generateTransactionId('GIFT');
      const astrologerTransactionId = this.generateTransactionId('EARN');

      // ✅ Create USER transaction (gift sent)
      const userTransaction = new this.transactionModel({
        transactionId: userTransactionId,
        userId: new Types.ObjectId(userId),
        userModel: 'User',
        type: 'gift',
        amount: amount,
        cashAmount: cashDebited,
        bonusAmount: bonusDebited,
        balanceBefore: beforeBalance,
        balanceAfter: user.wallet.balance,
        description: userDescription,
        orderId: streamId || astrologerId,
        sessionId: streamId,
        sessionType: context === 'stream' ? 'stream_gift' : 'direct_gift',
        relatedAstrologerId: new Types.ObjectId(astrologerId),
        grossAmount: amount,
        platformCommission: platformCommission,
        netAmount: astrologerEarning,
        status: 'completed',
        metadata: {
          kind: 'gift',
          astrologerId,
          astrologerName,
          streamId: streamId || null,
          giftType,
          context,
          paymentType: 'user_gift',
        },
        linkedTransactionId: astrologerTransactionId,
        createdAt: new Date(),
      });

      // ✅ Create ASTROLOGER transaction (gift received)
      const astrologerTransaction = new this.transactionModel({
        transactionId: astrologerTransactionId,
        userId: new Types.ObjectId(astrologerId),
        userModel: 'Astrologer',
        type: 'gift',
        amount: astrologerEarning,
        grossAmount: amount,
        platformCommission: platformCommission,
        netAmount: astrologerEarning,
        description: astrologerDescription,
        orderId: streamId || userId,
        sessionId: streamId,
        sessionType: context === 'stream' ? 'stream_gift' : 'direct_gift',
        relatedUserId: new Types.ObjectId(userId),
        status: 'completed',
        metadata: {
          kind: 'gift',
          userId,
          userName,
          streamId: streamId || null,
          giftType,
          context,
          paymentType: 'astrologer_gift_earning',
        },
        linkedTransactionId: userTransactionId,
        createdAt: new Date(),
      });

      // Save both transactions
      await userTransaction.save({ session });
      await astrologerTransaction.save({ session });
      await user.save({ session });

      // Commit transaction
      await session.commitTransaction();

      // ✅ Update astrologer earnings
      await this.earningsService.recordGiftEarning(astrologerId, amount);

      // ✅ Update stream analytics if stream gift
      if (context === 'stream' && streamId) {
        await this.streamModel.findOneAndUpdate(
          { streamId },
          {
            $inc: {
              totalGifts: 1,
              totalRevenue: amount,
            },
          },
        );
      }

      this.logger.log(
        `✅ Gift processed: ₹${amount} | User: ${userId} (-₹${amount}) | Astrologer: ${astrologerId} (+₹${astrologerEarning}) | Context: ${context}`,
      );

      return {
        success: true,
        transactionId: userTransactionId,
        newBalance: user.wallet.balance,
        astrologerId,
        astrologerName,
        astrologerEarning,
        platformCommission,
        streamId,
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`❌ Gift processing failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * ✅ Get gift history for user
   */
  async getUserGiftHistory(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      context?: GiftContext;
    } = {},
  ): Promise<{
    success: boolean;
    data: {
      gifts: any[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = {
      userId: new Types.ObjectId(userId),
      userModel: 'User',
      type: 'gift',
    };

    if (filters.context) {
      query['metadata.context'] = filters.context;
    }

    const [gifts, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        gifts: gifts.map((gift) => ({
          transactionId: gift.transactionId,
          amount: gift.amount,
          description: gift.description,
          astrologerId: gift.metadata?.astrologerId,
          astrologerName: gift.metadata?.astrologerName,
          giftType: gift.metadata?.giftType,
          context: gift.metadata?.context,
          streamId: gift.metadata?.streamId,
          createdAt: gift.createdAt,
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
   * ✅ Get gifts received by astrologer
   */
  async getAstrologerGiftHistory(
    astrologerId: string,
    filters: {
      page?: number;
      limit?: number;
      context?: GiftContext;
    } = {},
  ): Promise<{
    success: boolean;
    data: {
      gifts: any[];
      totalEarned: number;
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = {
      userId: new Types.ObjectId(astrologerId),
      userModel: 'Astrologer',
      type: 'gift',
    };

    if (filters.context) {
      query['metadata.context'] = filters.context;
    }

    const [gifts, total, totalEarned] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
      this.transactionModel.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        gifts: gifts.map((gift) => ({
          transactionId: gift.transactionId,
          amount: gift.amount,
          description: gift.description,
          userId: gift.metadata?.userId,
          userName: gift.metadata?.userName,
          giftType: gift.metadata?.giftType,
          context: gift.metadata?.context,
          streamId: gift.metadata?.streamId,
          createdAt: gift.createdAt,
        })),
        totalEarned: totalEarned[0]?.total || 0,
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
