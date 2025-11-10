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

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(WalletTransaction.name)
    private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
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
        // ✅ Update user wallet balance atomically
        const currentBalance = user.wallet?.balance || 0;
        const newBalance = currentBalance + transaction.amount;

        if (!user.wallet) {
          user.wallet = {
            balance: 0,
            currency: 'INR',
            totalRecharged: 0,
            totalSpent: 0,
          };
        }

        user.wallet.balance = newBalance;
        user.wallet.totalRecharged =
          (user.wallet.totalRecharged || 0) + transaction.amount;
        user.wallet.lastRechargeAt = new Date();
        user.wallet.lastTransactionAt = new Date();

        transaction.balanceAfter = newBalance;
        transaction.description = `Wallet recharged successfully with ₹${transaction.amount}`;

        this.logger.log(
          `Payment verified: ${transactionId} | New balance: ₹${newBalance}`,
        );
      } else {
        transaction.failureReason = 'Payment failed or cancelled by user';
        this.logger.warn(`Payment failed: ${transactionId}`);
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

    if (!user.wallet || user.wallet.balance < amount) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ₹${amount}, Available: ₹${user.wallet?.balance || 0}`,
      );
    }

    const transactionId = this.generateTransactionId('TXN');

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type: 'deduction',
      amount,
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance - amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    user.wallet.balance -= amount;
    user.wallet.totalSpent = (user.wallet.totalSpent || 0) + amount;
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

    const transactionId = this.generateTransactionId('REFUND');

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type: 'refund',
      amount,
      balanceBefore: user.wallet?.balance || 0,
      balanceAfter: (user.wallet?.balance || 0) + amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: 'INR', // ✅ Now valid after schema update
        totalRecharged: 0,
        totalSpent: 0,
      };
    }

    user.wallet.balance += amount;
    user.wallet.lastTransactionAt = new Date();

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

    const transactionId = this.generateTransactionId(type.toUpperCase());

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      type,
      amount,
      balanceBefore: user.wallet?.balance || 0,
      balanceAfter: (user.wallet?.balance || 0) + amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    if (!user.wallet) {
      user.wallet = {
        balance: 0,
        currency: 'INR', // ✅ Now valid after schema update
        totalRecharged: 0,
        totalSpent: 0,
      };
    }

    user.wallet.balance += amount;
    user.wallet.lastTransactionAt = new Date();

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

    return {
      success: true,
      data: {
        currentBalance: user.wallet?.balance || 0,
        currency: user.wallet?.currency || 'INR',
        totalRecharged: rechargeTotal[0]?.total || 0,
        totalSpent: spentTotal[0]?.total || 0,
        totalTransactions,
        lastRechargeAt: user.wallet?.lastRechargeAt || null,
        lastTransactionAt: user.wallet?.lastTransactionAt || null,
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

      // ✅ Verify wallet still has balance
      const currentBalance = user.wallet?.balance || 0;
      if (currentBalance < chargeAmount) {
        throw new BadRequestException('Insufficient wallet balance to charge');
      }

      const chargeTransactionId = this.generateTransactionId('CHARGE');

      // ✅ Mark hold as converted
      holdTransaction.status = 'completed';
      holdTransaction.convertedAt = new Date();
      holdTransaction.linkedTransactionId = chargeTransactionId;
      await holdTransaction.save({ session });

      // ✅ Create charge transaction
      const chargeTransaction = new this.transactionModel({
        transactionId: chargeTransactionId,
        userId: new Types.ObjectId(userId),
        type: 'charge',
        amount: chargeAmount,
        orderId,
        status: 'completed',
        balanceBefore: currentBalance,
        balanceAfter: currentBalance - chargeAmount,
        description: `CHARGE: ${description}`,
        linkedHoldTransactionId: holdTransaction.transactionId,
        createdAt: new Date(),
      });

      // ✅ Deduct from wallet
      user.wallet.balance -= chargeAmount;
      user.wallet.totalSpent =
        (user.wallet.totalSpent || 0) + chargeAmount;
      user.wallet.lastTransactionAt = new Date();

      await chargeTransaction.save({ session });
      await user.save({ session });

      // ✅ Refund unused amount if any
      const unusedAmount = heldAmount - chargeAmount;
      if (unusedAmount > 0) {
        await this.refundUnusedAmount(
          userId,
          unusedAmount,
          orderId,
          `Refund unused amount from order ${orderId}`,
          session,
        );
      }

      await session.commitTransaction();

      this.logger.log(
        `Charged from hold: ₹${chargeAmount} for order ${orderId} | Balance: ₹${user.wallet.balance}`,
      );

      return {
        success: true,
        transactionId: chargeTransaction.transactionId,
        chargedAmount: chargeAmount,
        refundedAmount: unusedAmount,
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
   * ✅ REFUND UNUSED AMOUNT (Internal - After Session Charged)
   */
  private async refundUnusedAmount(
    userId: string,
    refundAmount: number,
    orderId: string,
    description: string,
    session: ClientSession,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).session(session);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const refundTransactionId = this.generateTransactionId('REFUND');

    const refundTransaction = new this.transactionModel({
      transactionId: refundTransactionId,
      userId: new Types.ObjectId(userId),
      type: 'refund',
      amount: refundAmount,
      orderId,
      status: 'completed',
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance + refundAmount,
      description: `REFUND (Unused): ${description}`,
      createdAt: new Date(),
    });

    user.wallet.balance += refundAmount;
    user.wallet.lastTransactionAt = new Date();

    await refundTransaction.save({ session });
    await user.save({ session });

    this.logger.log(`Refunded unused amount: ₹${refundAmount} to user ${userId}`);
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
      },
    };
  }
}
