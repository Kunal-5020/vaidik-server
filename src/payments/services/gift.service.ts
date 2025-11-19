import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletService } from './wallet.service';
import { EarningsService } from '../../astrologers/services/earnings.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { StreamSession, StreamSessionDocument } from '../../streaming/schemas/stream-session.schema';

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
  ) {}

  async sendGift(params: SendGiftParams): Promise<{
    transactionId: string;
    newBalance: number;
    astrologerId: string;
    astrologerName: string;
    streamId?: string;
  }> {
    const { userId, amount, giftType, context } = params;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Gift amount must be greater than zero');
    }

    let astrologerId = params.astrologerId;
    let streamId = params.streamId;

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

    const [user, astrologer] = await Promise.all([
      this.userModel.findById(userId).select('name wallet balance'),
      this.astrologerModel.findById(astrologerId).select('name earnings'),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const astrologerName = astrologer.name || 'Astrologer';
    const description =
      context === 'stream'
        ? `Gift in livestream to ${astrologerName} (stream: ${streamId})`
        : `Gift to ${astrologerName}`;

    const metadata = {
      kind: 'gift',
      astrologerId,
      astrologerName,
      streamId: streamId ?? null,
      giftType,
      context,
    };

    const transaction = await this.walletService.deductFromWallet(
      userId,
      amount,
      context === 'stream' ? (streamId as string) : astrologerId,
      description,
      undefined,
      metadata,
    );

    await this.earningsService.recordGiftEarning(astrologerId, amount);

    this.logger.log(
      `Gift processed: ₹${amount} | User: ${userId} | Astrologer: ${astrologerId} | Context: ${context}`,
    );

    return {
      transactionId: transaction.transactionId,
      newBalance: transaction.balanceAfter,
      astrologerId,
      astrologerName,
      streamId,
    };
  }
}

