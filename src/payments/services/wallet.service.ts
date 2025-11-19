import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from '../schemas/wallet-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { RazorpayService } from './razorpay.service';
import { GiftCard, GiftCardDocument } from '../schemas/gift-card.schema';
import { WalletRefundRequest, WalletRefundRequestDocument } from '../schemas/wallet-refund-request.schema';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(WalletTransaction.name)
    private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(GiftCard.name)
    private giftCardModel: Model<GiftCardDocument>,
    @InjectModel(WalletRefundRequest.name)
    private walletRefundModel: Model<WalletRefundRequestDocument>,
    private razorpayService: RazorpayService, // ✅ Only Razorpay
  ) {}

  // ===== UTILITY METHODS =====

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Start MongoDB session helper
   */
  private async startSession(): Promise<ClientSession> {
    return this.transactionModel.db.startSession();
  }

  /**
   * Ensure wallet object has split balances (cash/bonus)
   */
  private ensureWallet(user: UserDocument): void {
    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: 'INR',
        totalRecharged: 0,
        totalSpent: 0,
        lastRechargeAt: null,
        lastTransactionAt: null,
        cashBalance: 0,
        bonusBalance: 0,
        totalBonusReceived: 0,
        totalBonusSpent: 0,
      } as any;
    }

    user.wallet.cashBalance = user.wallet.cashBalance ?? user.wallet.balance ?? 0;
    user.wallet.bonusBalance = user.wallet.bonusBalance ?? 0;
    user.wallet.totalBonusReceived = user.wallet.totalBonusReceived ?? 0;
    user.wallet.totalBonusSpent = user.wallet.totalBonusSpent ?? 0;

    user.wallet.balance = (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
  }

  /**
   * Apply debit to wallet using bonus first, then cash
   */
  private applyDebit(
    wallet: any,
    amount: number,
  ): { cashDebited: number; bonusDebited: number } {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const totalAvailable = (wallet.cashBalance || 0) + (wallet.bonusBalance || 0);
    if (totalAvailable < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ₹${amount}, Available: ₹${totalAvailable}`,
      );
    }

    const bonusAvailable = wallet.bonusBalance || 0;
    const bonusDebited = Math.min(bonusAvailable, amount);
    const cashDebited = amount - bonusDebited;

    wallet.bonusBalance = bonusAvailable - bonusDebited;
    wallet.cashBalance = (wallet.cashBalance || 0) - cashDebited;
    wallet.balance = (wallet.cashBalance || 0) + (wallet.bonusBalance || 0);

    wallet.totalBonusSpent = (wallet.totalBonusSpent || 0) + bonusDebited;
    wallet.totalSpent = (wallet.totalSpent || 0) + amount;

    return { cashDebited, bonusDebited };
  }

  // ===== CREATE RECHARGE TRANSACTION (RAZORPAY ONLY) =====

  async createRechargeTransaction(
    userId: string,
    amount: number,
    currency: string = 'INR',
  ): Promise<any> {
    // ✅ Validate user exists
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Validate amount
    if (amount < 100) {
      throw new BadRequestException('Minimum recharge amount is ₹100');
    }

    const transactionId = this.generateTransactionId('TXN');

    try {
      // ✅ Create pending transaction record
      const transaction = new this.transactionModel({
        transactionId,
        userId: new Types.ObjectId(userId),
        type: 'recharge',
        amount,
        balanceBefore: user.wallet?.balance || 0,
        balanceAfter: user.wallet?.balance || 0, // Will update on success
        description: `Wallet recharge of ${currency} ${amount}`,
        paymentGateway: 'razorpay',
        status: 'pending',
        createdAt: new Date(),
      });

      await transaction.save();

      // ✅ Create Razorpay order
      const razorpayOrder = await this.razorpayService.createOrder(
        amount,
        currency,
        userId,
        transactionId,
      );

      this.logger.log(
        `Recharge transaction created: ${transactionId} | Amount: ${currency} ${amount}`,
      );

      return {
        success: true,
        message: 'Recharge transaction created successfully',
        data: {
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          currency: razorpayOrder.currency,
          status: transaction.status,
          razorpay: {
            orderId: razorpayOrder.gatewayOrderId,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: this.razorpayService.getKeyId(), // For frontend
          },
        },
      };
    } catch (error: any) {
      this.logger.error(`Recharge creation failed: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to create recharge transaction: ${error.message}`,
      );
    }
  }

  // ===== VERIFY PAYMENT (WITH TRANSACTION) =====

  async verifyPayment(
    transactionId: string,
    paymentId: string,
    status: 'completed' | 'failed',
    promotionId?: string,
    bonusPercentage?: number,
  ): Promise<any> {
    const session = await this.startSession();
    session.startTransaction();

    try {
      // ✅ Find transaction
      const transaction = await this.transactionModel
        .findOne({ transactionId })
        .session(session);

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      if (transaction.status !== 'pending') {
        throw new BadRequestException(
          `Transaction already ${transaction.status}`,
        );
      }

      // ✅ Find user
      const user = await this.userModel
        .findById(transaction.userId)
        .session(session);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // ✅ Update transaction
      transaction.paymentId = paymentId;
      transaction.status = status;

      if (status === 'completed') {
        // ✅ Ensure wallet structure
        this.ensureWallet(user as any);

        // Optional promotion/bonus handling
        let bonusAmount = 0;
        if (bonusPercentage && bonusPercentage > 0) {
          bonusAmount = Math.floor((transaction.amount * bonusPercentage) / 100);
        }

        if (promotionId) {
          (transaction as any).promotionId = promotionId;
        }
        if (bonusAmount > 0) {
          transaction.bonusAmount = bonusAmount;
        }

        // ✅ Update user wallet split balances
        user.wallet.cashBalance = (user.wallet.cashBalance || 0) + transaction.amount;
        user.wallet.bonusBalance = (user.wallet.bonusBalance || 0) + bonusAmount;
        user.wallet.balance = user.wallet.cashBalance + user.wallet.bonusBalance;
        user.wallet.totalRecharged =
          (user.wallet.totalRecharged || 0) + transaction.amount;
        user.wallet.totalBonusReceived =
          (user.wallet.totalBonusReceived || 0) + bonusAmount;
        user.wallet.lastRechargeAt = new Date();
        user.wallet.lastTransactionAt = new Date();

        transaction.balanceAfter = user.wallet.balance;
        transaction.description = `Wallet recharged successfully with ₹${transaction.amount}${
          bonusAmount > 0 ? ` + bonus ₹${bonusAmount}` : ''
        }`;

        this.logger.log(
          `Payment verified: ${transactionId} | New balance: ₹${user.wallet.balance} (cash=${user.wallet.cashBalance}, bonus=${user.wallet.bonusBalance})`,
        );
      } else {
      }

      // ✅ Save changes atomically
      await user.save({ session });
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        message:
          status === 'completed'
            ? 'Payment verified and wallet updated successfully'
            : 'Payment verification failed',
        data: {
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          status: transaction.status,
          newBalance: status === 'completed' ? user.wallet.balance : null,
        },
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Payment verification failed: ${error.message}`);
      throw new InternalServerErrorException(
        `Payment verification failed: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  // ===== DEDUCT FROM WALLET (WITH TRANSACTION) =====

  async deductFromWallet(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
  session: ClientSession | undefined = undefined, // ✅ Fixed: Explicit default
  metadata: Record<string, any> = {},
): Promise<WalletTransactionDocument> {
  if (amount <= 0) {
    throw new BadRequestException('Amount must be greater than 0');
  }

  const useExternalSession = !!session;
  const localSession = session || (await this.startSession());

  if (!useExternalSession) {
    localSession.startTransaction();
  }

  try {
    const user = await this.userModel
      .findById(userId)
      .session(localSession);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    if ((user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0) < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ₹${amount}, Available: ₹${
          (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0)
        }`,
      );
    }

    const { cashDebited, bonusDebited } = this.applyDebit(user.wallet, amount);

    const transactionId = this.generateTransactionId('TXN');

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type: 'deduction',
      amount,
      cashAmount: cashDebited,
      bonusAmount: bonusDebited,
      balanceBefore: user.wallet.balance + amount,
      balanceAfter: user.wallet.balance,
      description,
      orderId,
      metadata,
      status: 'completed',
      createdAt: new Date(),
    });

    user.wallet.lastTransactionAt = new Date();

    await transaction.save({ session: localSession });
    await user.save({ session: localSession });

    if (!useExternalSession) {
      await localSession.commitTransaction();
    }

    this.logger.log(`Deducted ₹${amount} from user ${userId} for order ${orderId}`);

    return transaction;
  } catch (error: any) {
    if (!useExternalSession) {
      await localSession.abortTransaction();
    }
    this.logger.error(`Deduction failed: ${error.message}`);
    throw error;
  } finally {
    if (!useExternalSession) {
      localSession.endSession();
    }
  }
}


  // ===== REFUND TO WALLET (WITH TRANSACTION) =====

  async refundToWallet(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
  session: ClientSession | undefined = undefined, // ✅ Fixed: Explicit default
): Promise<WalletTransactionDocument> {
  if (amount <= 0) {
    throw new BadRequestException('Amount must be greater than 0');
  }

  const useExternalSession = !!session;
  const localSession = session || (await this.startSession());

  if (!useExternalSession) {
    localSession.startTransaction();
  }

  try {
    const user = await this.userModel
      .findById(userId)
      .session(localSession);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    const transactionId = this.generateTransactionId('REFUND');

    // Order refunds and admin credits are treated as non-withdrawable bonus
    const beforeBalance = user.wallet.balance;
    user.wallet.bonusBalance = (user.wallet.bonusBalance || 0) + amount;
    user.wallet.balance = (user.wallet.cashBalance || 0) + user.wallet.bonusBalance;
    user.wallet.lastTransactionAt = new Date();

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type: 'refund',
      amount,
      bonusAmount: amount,
      isBonus: true,
      balanceBefore: beforeBalance,
      balanceAfter: user.wallet.balance,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    await transaction.save({ session: localSession });
    await user.save({ session: localSession });

    if (!useExternalSession) {
      await localSession.commitTransaction();
    }

    this.logger.log(`Refunded ₹${amount} to user ${userId} for order ${orderId}`);

    return transaction;
  } catch (error: any) {
    if (!useExternalSession) {
      await localSession.abortTransaction();
    }
    this.logger.error(`Refund failed: ${error.message}`);
    throw error;
  } finally {
    if (!useExternalSession) {
      localSession.endSession();
    }
  }
}

  // ===== CREDIT TO WALLET (WITH TRANSACTION) =====

 async creditToWallet(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
  type: 'refund' | 'bonus' | 'reward' = 'refund',
  session: ClientSession | undefined = undefined, // ✅ Fixed: Explicit default
): Promise<WalletTransactionDocument> {
  if (amount <= 0) {
    throw new BadRequestException('Amount must be greater than 0');
  }

  const useExternalSession = !!session;
  const localSession = session || (await this.startSession());

  if (!useExternalSession) {
    localSession.startTransaction();
  }

  try {
    const user = await this.userModel
      .findById(userId)
      .session(localSession);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    const transactionId = this.generateTransactionId(type.toUpperCase());

    // For generic creditToWallet, treat as bonus by default (non-withdrawable)
    const beforeBalance = user.wallet.balance;
    const isBonus = type === 'bonus' || type === 'reward' || type === 'refund';

    if (isBonus) {
      user.wallet.bonusBalance = (user.wallet.bonusBalance || 0) + amount;
    } else {
      user.wallet.cashBalance = (user.wallet.cashBalance || 0) + amount;
    }
    user.wallet.balance = (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
    user.wallet.lastTransactionAt = new Date();

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type,
      amount,
      cashAmount: !isBonus ? amount : undefined,
      bonusAmount: isBonus ? amount : undefined,
      isBonus: isBonus || undefined,
      balanceBefore: beforeBalance,
      balanceAfter: user.wallet.balance,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    await transaction.save({ session: localSession });
    await user.save({ session: localSession });

    if (!useExternalSession) {
      await localSession.commitTransaction();
    }

    this.logger.log(`Credited ₹${amount} to user ${userId} | Type: ${type}`);

    return transaction;
  } catch (error: any) {
    if (!useExternalSession) {
      await localSession.abortTransaction();
    }
    this.logger.error(`Credit failed: ${error.message}`);
    throw error;
  } finally {
    if (!useExternalSession) {
      localSession.endSession();
    }
  }
}

  // ===== GET TRANSACTIONS =====

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: string; status?: string },
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { userId: new Types.ObjectId(userId) };

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;

    const [transactions, total] = await Promise.all([
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
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  // ===== GET TRANSACTION DETAILS =====

  async getTransactionDetails(
    transactionId: string,
    userId: string,
  ): Promise<any> {
    const transaction = await this.transactionModel
      .findOne({
        transactionId,
        userId: new Types.ObjectId(userId),
      })
      .lean();

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      success: true,
      data: transaction,
    };
  }

  // ===== GET WALLET STATISTICS =====

  async getWalletStats(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [totalTransactions, rechargeTotal, spentTotal] = await Promise.all([
      this.transactionModel.countDocuments({
        userId: new Types.ObjectId(userId),
      }),
      this.transactionModel.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            type: 'recharge',
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            type: { $in: ['deduction', 'charge'] },
            status: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const currentBalance = user.wallet?.balance || 0;

    return {
      success: true,
      data: {
        currentBalance,
        currency: user.wallet?.currency || 'INR',
        totalRecharged: rechargeTotal[0]?.total || 0,
        totalSpent: spentTotal[0]?.total || 0,
        totalTransactions,
        lastRechargeAt: user.wallet?.lastRechargeAt || null,
        lastTransactionAt: user.wallet?.lastTransactionAt || null,
        cashBalance: (user.wallet as any)?.cashBalance ?? currentBalance,
        bonusBalance: (user.wallet as any)?.bonusBalance ?? 0,
      },
    };
  }

  // ===== GET PAYMENT LOGS =====

  async getPaymentLogs(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {
      userId: new Types.ObjectId(userId),
      type: 'recharge',
    };

    if (status) {
      query.status = status;
    }

    const [logs, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .select(
          'transactionId amount paymentGateway paymentId status description createdAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  // ===== CHECK BALANCE =====

  async checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet.balance')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return (user.wallet?.balance || 0) >= requiredAmount;
  }

  // ===== GET BALANCE =====

  async getBalance(userId: string): Promise<number> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet.balance')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.wallet?.balance || 0;
  }

  // ===== PAYMENT HOLD SYSTEM =====

  /**
   * ✅ HOLD AMOUNT (Temporary - Not Charged Yet)
   * Called when: User initiates chat/call
   * Held for: 3-5 minutes (waiting for astrologer response)
   */
  async holdAmount(
    userId: string,
    amount: number,
    orderId: string,
    description: string,
  ): Promise<any> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const session = await this.startSession();
    session.startTransaction();

    try {
      const user = await this.userModel.findById(userId).session(session);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // ✅ Verify balance before holding
      const currentBalance = user.wallet?.balance || 0;
      if (currentBalance < amount) {
        throw new BadRequestException(
          `Insufficient balance. Need ₹${amount}, have ₹${currentBalance}`,
        );
      }

      const transactionId = this.generateTransactionId('HOLD');

      // ✅ Create hold transaction
      const transaction = new this.transactionModel({
        transactionId,
        userId: new Types.ObjectId(userId),
        type: 'hold',
        amount,
        orderId,
        status: 'pending',
        balanceBefore: currentBalance,
        balanceAfter: currentBalance, // Hold doesn't reduce balance yet
        description: `HOLD: ${description}`,
        holdReleaseableAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        createdAt: new Date(),
      });

      await transaction.save({ session });
      await session.commitTransaction();

      this.logger.log(
        `Amount held: ₹${amount} for order ${orderId} | Transaction: ${transactionId}`,
      );

      return {
        success: true,
        transactionId: transaction.transactionId,
        holdAmount: amount,
        message: 'Amount held successfully',
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Hold amount failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * ✅ CHARGE FROM HOLD (Convert Hold to Actual Charge)
   * Called when: Session ends and billing is calculated
   */
  async chargeFromHold(
    userId: string,
    chargeAmount: number,
    orderId: string,
    description: string,
  ): Promise<any> {
    const session = await this.startSession();
    session.startTransaction();

    try {
      const user = await this.userModel.findById(userId).session(session);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      this.ensureWallet(user as any);

      // ✅ Find the hold transaction
      const holdTransaction = await this.transactionModel
        .findOne({
          userId: new Types.ObjectId(userId),
          orderId,
          type: 'hold',
          status: 'pending',
        })
        .session(session);

      if (!holdTransaction) {
        throw new BadRequestException(
          'No hold transaction found for this order',
        );
      }

      const heldAmount = holdTransaction.amount;

      if (chargeAmount > heldAmount) {
        throw new BadRequestException(
          `Charge amount (₹${chargeAmount}) exceeds held amount (₹${heldAmount})`,
        );
      }

      const totalAvailable =
        (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
      if (totalAvailable < chargeAmount) {
        throw new BadRequestException(
          `Insufficient wallet balance to charge. Required: ₹${chargeAmount}, Available: ₹${totalAvailable}`,
        );
      }

      const chargeTransactionId = this.generateTransactionId('CHARGE');

      // ✅ Mark hold as converted
      holdTransaction.status = 'completed';
      holdTransaction.convertedAt = new Date();
      holdTransaction.linkedTransactionId = chargeTransactionId;
      await holdTransaction.save({ session });

      const beforeBalance = user.wallet.balance;

      // ✅ Deduct from wallet using bonus first, then cash
      const { cashDebited, bonusDebited } = this.applyDebit(
        user.wallet,
        chargeAmount,
      );

      // ✅ Create charge transaction
      const chargeTransaction = new this.transactionModel({
        transactionId: chargeTransactionId,
        userId: new Types.ObjectId(userId),
        type: 'charge',
        amount: chargeAmount,
        cashAmount: cashDebited,
        bonusAmount: bonusDebited,
        orderId,
        status: 'completed',
        balanceBefore: beforeBalance,
        balanceAfter: user.wallet.balance,
        description: `CHARGE: ${description}`,
        linkedHoldTransactionId: holdTransaction.transactionId,
        createdAt: new Date(),
      });

      user.wallet.lastTransactionAt = new Date();

      await chargeTransaction.save({ session });
      await user.save({ session });

      await session.commitTransaction();

      this.logger.log(
        `Charged from hold: ₹${chargeAmount} for order ${orderId} | Balance: ₹${user.wallet.balance} (cash=${user.wallet.cashBalance}, bonus=${user.wallet.bonusBalance})`,
      );

      return {
        success: true,
        transactionId: chargeTransaction.transactionId,
        chargedAmount: chargeAmount,
        balanceAfter: user.wallet.balance,
        message: 'Charged successfully',
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Charge from hold failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * ✅ RELEASE HOLD (Refund Held Amount)
   * Called when: Astrologer rejects, Timeout, User cancels
   */
  async releaseHold(
    userId: string,
    orderId: string,
    description: string,
  ): Promise<any> {
    const session = await this.startSession();
    session.startTransaction();

    try {
      const user = await this.userModel.findById(userId).session(session);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // ✅ Find the hold transaction
      const holdTransaction = await this.transactionModel
        .findOne({
          userId: new Types.ObjectId(userId),
          orderId,
          type: 'hold',
          status: 'pending',
        })
        .session(session);

      if (!holdTransaction) {
        throw new BadRequestException('No hold transaction found to release');
      }

      const releaseAmount = holdTransaction.amount;

      // ✅ Mark hold as released
      holdTransaction.status = 'cancelled';
      holdTransaction.releasedAt = new Date();
      await holdTransaction.save({ session });

      user.wallet.lastTransactionAt = new Date();
      await user.save({ session });

      await session.commitTransaction();

      this.logger.log(`Hold released: ₹${releaseAmount} for order ${orderId}`);

      return {
        success: true,
        releasedAmount: releaseAmount,
        balanceAfter: user.wallet.balance,
        message: 'Hold released successfully',
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Release hold failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * ✅ GET WALLET WITH HOLD STATUS
   * Shows: Current balance + held amount + available balance
   */
  async getWalletWithHold(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Calculate total held amount
    const [heldTransactions] = await Promise.all([
      this.transactionModel.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            type: 'hold',
            status: 'pending',
          },
        },
        { $group: { _id: null, totalHeld: { $sum: '$amount' } } },
      ]),
    ]);

    const currentBalance = user.wallet?.balance || 0;
    const totalHeld = heldTransactions[0]?.totalHeld || 0;
    const availableBalance = currentBalance - totalHeld;

    return {
      success: true,
      data: {
        currentBalance,
        totalHeld,
        availableBalance: Math.max(0, availableBalance),
        canStartSession: availableBalance >= 0,
        // expose split if present
        cashBalance: (user.wallet as any)?.cashBalance ?? currentBalance,
        bonusBalance: (user.wallet as any)?.bonusBalance ?? 0,
      },
    };
  }

  // ===== GIFT CARD REDEMPTION =====

  async redeemGiftCard(userId: string, code: string): Promise<any> {
    const session = await this.startSession();
    session.startTransaction();
    try {
      const normalizedCode = code.trim().toUpperCase();

      const giftCard = await this.giftCardModel
        .findOne({ code: normalizedCode })
        .session(session);

      if (!giftCard || giftCard.status !== 'active') {
        throw new BadRequestException('Invalid or inactive gift card');
      }

      if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
        giftCard.status = 'expired';
        await giftCard.save({ session });
        throw new BadRequestException('Gift card has expired');
      }

      if (giftCard.redemptionsCount >= giftCard.maxRedemptions) {
        giftCard.status = 'exhausted';
        await giftCard.save({ session });
        throw new BadRequestException('Gift card already redeemed');
      }

      const user = await this.userModel.findById(userId).session(session);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      this.ensureWallet(user as any);

      const beforeBalance = user.wallet.balance;

      // As per business rule: gift cards are non-withdrawable bonus
      user.wallet.bonusBalance = (user.wallet.bonusBalance || 0) + giftCard.amount;
      user.wallet.balance = (user.wallet.cashBalance || 0) + user.wallet.bonusBalance;
      user.wallet.lastTransactionAt = new Date();

      const transactionId = this.generateTransactionId('GIFT');
      const txn = new this.transactionModel({
        transactionId,
        userId: user._id,
        type: 'giftcard',
        amount: giftCard.amount,
        bonusAmount: giftCard.amount,
        isBonus: true,
        balanceBefore: beforeBalance,
        balanceAfter: user.wallet.balance,
        description: `Gift card redemption (${normalizedCode})`,
        status: 'completed',
        giftCardCode: normalizedCode,
        createdAt: new Date(),
      });

      giftCard.redemptionsCount += 1;
      giftCard.redeemedBy = user._id as any;
      giftCard.redeemedAt = new Date();
      giftCard.redemptionTransactionId = transactionId;
      if (giftCard.redemptionsCount >= giftCard.maxRedemptions) {
        giftCard.status = 'exhausted';
      }

      await Promise.all([
        user.save({ session }),
        txn.save({ session }),
        giftCard.save({ session }),
      ]);

      await session.commitTransaction();

      return {
        success: true,
        message: 'Gift card redeemed successfully',
        data: {
          transactionId,
          amount: giftCard.amount,
          newBalance: user.wallet.balance,
          bonusBalance: user.wallet.bonusBalance,
        },
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Gift card redeem failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ===== WALLET REFUND TO BANK (ADMIN-ONLY HELPERS) =====

  async createWalletRefundRequest(
    userId: string,
    amount: number,
    reason?: string,
  ): Promise<WalletRefundRequestDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    const cashBalance = user.wallet.cashBalance || 0;
    if (amount > cashBalance) {
      throw new BadRequestException(
        `Cannot refund more than withdrawable balance. Requested: ₹${amount}, Available: ₹${cashBalance}`,
      );
    }

    const refundId = this.generateTransactionId('WREF');

    const request = new this.walletRefundModel({
      refundId,
      userId: user._id,
      amountRequested: amount,
      cashBalanceSnapshot: cashBalance,
      status: 'pending',
      reason,
    });

    await request.save();
    return request;
  }

  async processWalletRefund(
    refundId: string,
    adminId: string,
    payload: { amountApproved: number; paymentReference: string },
  ): Promise<any> {
    const request = await this.walletRefundModel.findOne({ refundId });
    if (!request) {
      throw new NotFoundException('Wallet refund request not found');
    }

    if (request.status !== 'pending' && request.status !== 'approved') {
      throw new BadRequestException('Refund request already processed');
    }

    const user = await this.userModel.findById(request.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    const amount = payload.amountApproved;
    if (amount <= 0) {
      throw new BadRequestException('Approved amount must be greater than 0');
    }

    if (amount > (user.wallet.cashBalance || 0)) {
      throw new BadRequestException(
        `Insufficient cash balance for refund. Approved: ₹${amount}, Cash: ₹${user.wallet.cashBalance || 0}`,
      );
    }

    const session = await this.startSession();
    session.startTransaction();

    try {
      const beforeBalance = user.wallet.balance;

      // Deduct only from cashBalance
      user.wallet.cashBalance = (user.wallet.cashBalance || 0) - amount;
      user.wallet.balance = (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
      user.wallet.lastTransactionAt = new Date();

      const transactionId = this.generateTransactionId('WDRAW');
      const txn = new this.transactionModel({
        transactionId,
        userId: user._id,
        type: 'withdrawal',
        amount,
        cashAmount: amount,
        balanceBefore: beforeBalance,
        balanceAfter: user.wallet.balance,
        description: 'Wallet refund to bank',
        status: 'completed',
        createdAt: new Date(),
      });

      request.amountApproved = amount;
      request.status = 'processed';
      request.processedBy = new Types.ObjectId(adminId);
      request.processedAt = new Date();
      request.paymentReference = payload.paymentReference;

      await Promise.all([
        user.save({ session }),
        txn.save({ session }),
        request.save({ session }),
      ]);

      await session.commitTransaction();

      return {
        success: true,
        message: 'Wallet refund processed successfully',
        data: {
          refundId: request.refundId,
          transactionId,
          amount,
          balanceAfter: user.wallet.balance,
        },
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Wallet refund process failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
}
