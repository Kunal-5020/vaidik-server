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

const GST_PERCENTAGE = 18;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(WalletTransaction.name)
    public transactionModel: Model<WalletTransactionDocument>,
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

  // ✅ NEW HELPER: Check if user already got bonus for this amount
 private async hasReceivedBonusForAmount(userId: string, amount: number): Promise<boolean> {
    const count = await this.transactionModel.countDocuments({
      userId: new Types.ObjectId(userId),
      type: 'recharge',
      status: 'completed',
      amount: amount,
      'metadata.hasBonus': true, // Improved check
    });
    return count > 0;
  }

 async createRechargeTransaction(
    userId: string,
    amount: number,
    currency: string = 'INR',
  ): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (amount < 50) throw new BadRequestException('Minimum recharge amount is ₹50');

    const transactionId = this.generateTransactionId('TXN');
    const gstAmount = Math.ceil((amount * GST_PERCENTAGE) / 100);
    const totalPayable = amount + gstAmount;

    try {
      const transaction = new this.transactionModel({
        transactionId,
        userId: new Types.ObjectId(userId),
        type: 'recharge',
        amount: amount,
        taxAmount: gstAmount,
        totalPayable: totalPayable,
        balanceBefore: user.wallet?.balance || 0,
        balanceAfter: user.wallet?.balance || 0,
        description: `Wallet recharge of ${currency} ${amount}`,
        paymentGateway: 'razorpay',
        status: 'pending',
        createdAt: new Date(),
      });

      await transaction.save();

      const razorpayOrder = await this.razorpayService.createOrder(
        totalPayable,
        currency,
        userId,
        transactionId,
      );

      return {
        success: true,
        message: 'Recharge initiated',
        data: {
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          gst: gstAmount,
          totalPayable: totalPayable,
          currency: razorpayOrder.currency,
          status: transaction.status,
          razorpay: {
            orderId: razorpayOrder.gatewayOrderId,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: this.razorpayService.getKeyId(),
          },
        },
      };
    } catch (error: any) {
      this.logger.error(`Recharge creation failed: ${error.message}`);
      throw new InternalServerErrorException(`Failed to create recharge: ${error.message}`);
    }
  }

  // ===== VERIFY PAYMENT (UPDATED FOR SEPARATE BONUS TXN) =====

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
      const transaction = await this.transactionModel.findOne({ transactionId }).session(session);
      if (!transaction) throw new NotFoundException('Transaction not found');
      if (transaction.status !== 'pending') throw new BadRequestException(`Transaction already ${transaction.status}`);

      const user = await this.userModel.findById(transaction.userId).session(session);
      if (!user) throw new NotFoundException('User not found');

      transaction.paymentId = paymentId;
      transaction.status = status;

      // ✅ FIX: Explicitly type the variable
      let bonusTransaction: WalletTransactionDocument | null = null;

      if (status === 'completed') {
        this.ensureWallet(user as any);

        const initialBalance = user.wallet.balance;
        const initialCash = user.wallet.cashBalance || 0;
        const initialBonus = user.wallet.bonusBalance || 0;

        // 1. Calculate Bonus
        let finalBonusPercentage = bonusPercentage || 0;
        const alreadyGotBonus = await this.hasReceivedBonusForAmount(user._id.toString(), transaction.amount);
        
        if (alreadyGotBonus) {
          finalBonusPercentage = 0; 
        }
        
        let bonusAmount = 0;
        if (finalBonusPercentage > 0) {
          bonusAmount = Math.floor((transaction.amount * finalBonusPercentage) / 100);
        }

        // 2. Process RECHARGE (Cash Component)
        user.wallet.cashBalance = initialCash + transaction.amount;
        user.wallet.totalRecharged = (user.wallet.totalRecharged || 0) + transaction.amount;
        
        // Update main transaction balances
        transaction.balanceBefore = initialBalance;
        transaction.balanceAfter = initialBalance + transaction.amount;
        transaction.description = `Wallet recharge of ₹${transaction.amount}`;
        
        if (promotionId) (transaction as any).metadata = { ...transaction.metadata, promotionId };
        
        if (bonusAmount > 0) {
           transaction.metadata = { ...transaction.metadata, hasBonus: true, bonusAmount };
        }

        // 3. Process BONUS (Separate Transaction)
        if (bonusAmount > 0) {
            user.wallet.bonusBalance = initialBonus + bonusAmount;
            user.wallet.totalBonusReceived = (user.wallet.totalBonusReceived || 0) + bonusAmount;

            const bonusTransactionId = this.generateTransactionId('BNS');
            
            bonusTransaction = new this.transactionModel({
                transactionId: bonusTransactionId,
                userId: user._id,
                userModel: 'User',
                type: 'bonus', // Separate type for analytics
                amount: bonusAmount,
                bonusAmount: bonusAmount,
                isBonus: true,
                status: 'completed',
                description: `Bonus for recharge of ₹${transaction.amount} (${finalBonusPercentage}%)`,
                linkedTransactionId: transactionId,
                balanceBefore: transaction.balanceAfter, 
                balanceAfter: (transaction.balanceAfter || 0) + bonusAmount,
                createdAt: new Date(),
                metadata: {
                    relatedRechargeId: transactionId,
                    percentage: finalBonusPercentage
                }
            });

            // Link main transaction to bonus
            transaction.linkedTransactionId = bonusTransactionId;
        }

        // 4. Update Final User Totals
        user.wallet.balance = user.wallet.cashBalance + user.wallet.bonusBalance;
        user.wallet.lastRechargeAt = new Date();
        user.wallet.lastTransactionAt = new Date();
      }

      await user.save({ session });
      await transaction.save({ session });
      
      if (bonusTransaction) {
          await bonusTransaction.save({ session });
      }

      await session.commitTransaction();

      return {
        success: true,
        message: status === 'completed' ? 'Payment verified successfully' : 'Payment verification failed',
        data: {
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          bonusAmount: bonusTransaction ? bonusTransaction.amount : 0,
          newBalance: status === 'completed' ? user.wallet.balance : null,
          bonusTransactionId: bonusTransaction ? bonusTransaction.transactionId : null
        },
      };
    } catch (error: any) {
      await session.abortTransaction();
      this.logger.error(`Verification failed: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    } finally {
      session.endSession();
    }
  }

  /**
 * Credit astrologer earnings (from chat/call sessions)
 */
async creditAstrologerEarnings(
    astrologerId: string,
    amount: number,
    orderId: string,
    sessionType: 'chat' | 'audio_call' | 'video_call',
    userName?: string,
    sessionId?: string,
    session: ClientSession | undefined = undefined,
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
      const transactionId = this.generateTransactionId('EARN');
  
      const description = userName
        ? `Earnings from ${sessionType.replace('_', ' ')} - ${userName}`
        : `Earnings from ${sessionType.replace('_', ' ')}`;
  
      const transaction = new this.transactionModel({
        transactionId,
        userId: new Types.ObjectId(astrologerId),
        userModel: 'Astrologer',
        type: 'earning',
        amount,
        orderId,
        description,
        status: 'completed',
        metadata: {
          userName,
          sessionType,
          sessionId,
          transactionType: 'astrologer_earning'
        },
        createdAt: new Date(),
      });
  
      await transaction.save({ session: localSession });
  
      if (!useExternalSession) {
        await localSession.commitTransaction();
      }
  
      return transaction;
    } catch (error: any) {
      if (!useExternalSession) {
        await localSession.abortTransaction();
      }
      throw error;
    } finally {
      if (!useExternalSession) {
        localSession.endSession();
      }
    }
  }

  // ===== DEDUCT FROM WALLET (WITH TRANSACTION) =====

  async deductFromWallet(
  userId: string,
  amount: number,
  orderId: string,
  description: string,
  session: ClientSession | undefined = undefined,
  metadata: Record<string, any> = {},
  astrologerName?: string, 
): Promise<WalletTransactionDocument> {
  if (amount <= 0) throw new BadRequestException('Amount must be greater than 0');
  const useExternalSession = !!session;
  const localSession = session || (await this.startSession());
  if (!useExternalSession) localSession.startTransaction();

  try {
    const user = await this.userModel.findById(userId).session(localSession);
    if (!user) throw new NotFoundException('User not found');
    this.ensureWallet(user as any);

    if ((user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0) < amount) {
      throw new BadRequestException(`Insufficient wallet balance.`);
    }

    const { cashDebited, bonusDebited } = this.applyDebit(user.wallet, amount);
    const transactionId = this.generateTransactionId('TXN');

    const finalDescription = astrologerName ? `${description} - ${astrologerName}` : description;
    const finalMetadata = astrologerName ? { ...metadata, astrologerName } : metadata;

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      userModel: 'User',
      type: 'deduction',
      amount,
      cashAmount: cashDebited,
      bonusAmount: bonusDebited,
      balanceBefore: user.wallet.balance + amount,
      balanceAfter: user.wallet.balance,
      description: finalDescription,
      orderId,
      metadata: finalMetadata,
      status: 'completed',
      createdAt: new Date(),
    });

    user.wallet.lastTransactionAt = new Date();
    await transaction.save({ session: localSession });
    await user.save({ session: localSession });

    if (!useExternalSession) await localSession.commitTransaction();
    return transaction;
  } catch (error: any) {
    if (!useExternalSession) await localSession.abortTransaction();
    throw error;
  } finally {
    if (!useExternalSession) localSession.endSession();
  }
}

/**
 * ✅ DEDUCT FROM USER (Simple wrapper for stream/call/chat)
 */
async deductFromUser(
  userId: string,
  amount: number,
  type: string,
  description: string,
  metadata: Record<string, any> = {},
): Promise<{ success: boolean; message?: string; transactionId?: string; newBalance?: number }> {
  try {
    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount must be greater than 0'
      };
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found'
      };
    }

    this.ensureWallet(user as any);

    const totalAvailable = (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
    if (totalAvailable < amount) {
      return {
        success: false,
        message: `Insufficient balance. Required: ₹${amount}, Available: ₹${totalAvailable}`
      };
    }

    const { cashDebited, bonusDebited } = this.applyDebit(user.wallet, amount);

    const transactionId = this.generateTransactionId('TXN');

    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(userId),
      userModel: 'User',
      type: 'deduction',
      amount,
      cashAmount: cashDebited,
      bonusAmount: bonusDebited,
      balanceBefore: totalAvailable,
      balanceAfter: user.wallet.balance,
      description,
      metadata,
      status: 'completed',
      createdAt: new Date(),
    });

    user.wallet.lastTransactionAt = new Date();

    await transaction.save();
    await user.save();

    this.logger.log(`Deducted ₹${amount} from user ${userId} | Type: ${type}`);

    return {
      success: true,
      transactionId: transaction.transactionId,
      newBalance: user.wallet.balance,
      message: 'Deducted successfully'
    };
  } catch (error: any) {
    this.logger.error(`Deduct from user failed: ${error.message}`);
    return {
      success: false,
      message: error.message || 'Deduction failed'
    };
  }
}

/**
 * ✅ FIXED: Credit to astrologer (Simple wrapper for stream/call/chat)
 */
async creditToAstrologer(
  astrologerId: string,
  amount: number,
  type: string,
  description: string,
  metadata: Record<string, any> = {},
): Promise<{ success: boolean; message?: string; transactionId?: string }> {
  try {
    if (amount <= 0) {
      return {
        success: false,
        message: 'Amount must be greater than 0',
      };
    }

    const transactionId = this.generateTransactionId('EARN');

    // ✅ FIXED: Add balanceBefore and balanceAfter (set to 0 for astrologers)
    const transaction = new this.transactionModel({
      transactionId,
      userId: new Types.ObjectId(astrologerId),
      userModel: 'Astrologer',
      type: 'earning',
      amount,
      balanceBefore: 0, // ✅ Astrologers don't have wallet balance
      balanceAfter: 0, // ✅ Earnings tracked in Astrologer schema
      description,
      status: 'completed',
      metadata: {
        ...metadata,
        transactionType: 'astrologer_earning',
        serviceType: type,
      },
      createdAt: new Date(),
    });

    await transaction.save();

    this.logger.log(`Astrologer credited: ${astrologerId} | Amount: ₹${amount} | Type: ${type}`);

    return {
      success: true,
      transactionId: transaction.transactionId,
      message: 'Credited successfully',
    };
  } catch (error: any) {
    this.logger.error(`Credit to astrologer failed: ${error.message}`);
    return {
      success: false,
      message: error.message || 'Credit failed',
    };
  }
}

/**
 * ✅ NEW: Process session payment (user pays, astrologer earns)
 * Creates ONE transaction that records both sides of the payment
 */

async processSessionPayment(data: {
  userId: string;
  astrologerId: string;
  amount: number;
  orderId: string;
  sessionId: string;
  sessionType: 'audio_call' | 'video_call' | 'chat' | 'stream_call';
  userName?: string;
  astrologerName?: string;
  durationMinutes?: number;
}): Promise<{
  success: boolean;
  message?: string;
  transactionId?: string;
  userTransaction?: any;
  astrologerTransaction?: any;
}> {
  const session = await this.startSession();
  session.startTransaction();

  try {
    // 1. Get user
    const user = await this.userModel.findById(data.userId).session(session);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.ensureWallet(user as any);

    // 2. Check user balance
    const totalAvailable = (user.wallet.cashBalance || 0) + (user.wallet.bonusBalance || 0);
    if (totalAvailable < data.amount) {
      throw new BadRequestException(
        `Insufficient balance. Required: ₹${data.amount}, Available: ₹${totalAvailable}`,
      );
    }

    // 3. Calculate commission split (40% platform, 60% astrologer)
    const platformCommission = (data.amount * 40) / 100;
    const astrologerEarning = data.amount - platformCommission;

    // 4. Deduct from user wallet (bonus first, then cash)
    const beforeBalance = user.wallet.balance;
    const { cashDebited, bonusDebited } = this.applyDebit(user.wallet, data.amount);

    // 5. Generate descriptions based on session type
    const astrologerName = data.astrologerName || 'Astrologer';
    const userName = data.userName || 'User';

    let userDescription = '';
    let astrologerDescription = '';

    switch (data.sessionType) {
      case 'audio_call':
        userDescription = `Call with ${astrologerName}`;
        astrologerDescription = `Call with ${userName}`;
        break;
      case 'video_call':
        userDescription = `Video call with ${astrologerName}`;
        astrologerDescription = `Video call with ${userName}`;
        break;
      case 'chat':
        userDescription = `Chat with ${astrologerName}`;
        astrologerDescription = `Chat with ${userName}`;
        break;
      case 'stream_call':
        userDescription = `Livestream call with ${astrologerName}`;
        astrologerDescription = `Livestream call with ${userName}`;
        break;
      default:
        userDescription = `Session with ${astrologerName}`;
        astrologerDescription = `Session with ${userName}`;
    }

    // 6. Generate transaction IDs
    const userTransactionId = this.generateTransactionId('PAY');
    const astrologerTransactionId = this.generateTransactionId('EARN');

    // 7. Create USER transaction (deduction)
    const userTransaction = new this.transactionModel({
      transactionId: userTransactionId,
      userId: new Types.ObjectId(data.userId),
      userModel: 'User',
      type: 'session_payment',
      amount: data.amount,
      cashAmount: cashDebited,
      bonusAmount: bonusDebited,
      balanceBefore: beforeBalance,
      balanceAfter: user.wallet.balance,
      description: userDescription,
      orderId: data.orderId,
      sessionId: data.sessionId,
      sessionType: data.sessionType,
      relatedAstrologerId: new Types.ObjectId(data.astrologerId),
      grossAmount: data.amount,
      platformCommission: platformCommission,
      netAmount: astrologerEarning,
      status: 'completed',
      metadata: {
        astrologerId: data.astrologerId,
        astrologerName: data.astrologerName,
        sessionType: data.sessionType,
        durationMinutes: data.durationMinutes || 0,
        paymentType: 'user_payment',
      },
      linkedTransactionId: astrologerTransactionId,
      createdAt: new Date(),
    });

    // 8. Create ASTROLOGER transaction (earning)
    const astrologerTransaction = new this.transactionModel({
      transactionId: astrologerTransactionId,
      userId: new Types.ObjectId(data.astrologerId),
      userModel: 'Astrologer',
      type: 'session_payment',
      amount: astrologerEarning,
      grossAmount: data.amount,
      platformCommission: platformCommission,
      netAmount: astrologerEarning,
      description: astrologerDescription,
      orderId: data.orderId,
      sessionId: data.sessionId,
      sessionType: data.sessionType,
      relatedUserId: new Types.ObjectId(data.userId),
      status: 'completed',
      metadata: {
        userId: data.userId,
        userName: data.userName,
        sessionType: data.sessionType,
        durationMinutes: data.durationMinutes || 0,
        paymentType: 'astrologer_earning',
      },
      linkedTransactionId: userTransactionId,
      createdAt: new Date(),
    });

    // 9. Save both transactions
    await userTransaction.save({ session });
    await astrologerTransaction.save({ session });

    // 10. Update user wallet timestamps
    user.wallet.lastTransactionAt = new Date();
    await user.save({ session });

    // 11. Commit transaction
    await session.commitTransaction();

    this.logger.log(
      `✅ Session payment processed | User: ${data.userId} (-₹${data.amount}) | Astrologer: ${data.astrologerId} (+₹${astrologerEarning}) | Type: ${data.sessionType}`,
    );

    return {
      success: true,
      transactionId: userTransactionId,
      userTransaction: {
        id: userTransactionId,
        amount: data.amount,
        description: userDescription,
        balanceAfter: user.wallet.balance,
      },
      astrologerTransaction: {
        id: astrologerTransactionId,
        amount: astrologerEarning,
        description: astrologerDescription,
      },
      message: 'Session payment processed successfully',
    };
  } catch (error: any) {
    await session.abortTransaction();
    this.logger.error(`❌ Session payment failed: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
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


  // ===== GET PAYMENT LOGS (For Add Cash Screen History) =====
  async getPaymentLogs(userId: string, page: number = 1, limit: number = 20, status?: string): Promise<any> {
    const skip = (page - 1) * limit;
    // ✅ Include 'giftcard' type here so gift redemptions show up in payment logs if desired
    const query: any = {
      userId: new Types.ObjectId(userId),
      type: { $in: ['recharge', 'giftcard'] }, // Show both recharges and gift cards
    };

    if (status) query.status = status;

    const [logs, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .select('transactionId amount paymentGateway paymentId status description createdAt type giftCardCode') // Select relevant fields
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
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
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
      const giftCard = await this.giftCardModel.findOne({ code: normalizedCode }).session(session);

      if (!giftCard || giftCard.status !== 'active') throw new BadRequestException('Invalid Gift Card');
      if (giftCard.redemptionsCount >= giftCard.maxRedemptions) throw new BadRequestException('Card already redeemed');

      const user = await this.userModel.findById(userId).session(session);
      if (!user) throw new NotFoundException('User not found');

      this.ensureWallet(user as any);
      const beforeBalance = user.wallet.balance;

      user.wallet.bonusBalance = (user.wallet.bonusBalance || 0) + giftCard.amount;
      user.wallet.balance = (user.wallet.cashBalance || 0) + user.wallet.bonusBalance;
      user.wallet.lastTransactionAt = new Date();

      const transactionId = this.generateTransactionId('GIFT');
      
      const txn = new this.transactionModel({
        transactionId,
        userId: user._id,
        // ✅ Using 'credit' or 'giftcard' type ensures Frontend colors it Green
        type: 'giftcard', 
        amount: giftCard.amount, 
        bonusAmount: giftCard.amount,
        isBonus: true,
        balanceBefore: beforeBalance,
        balanceAfter: user.wallet.balance,
        description: `Redeemed Gift Card: ${normalizedCode}`,
        status: 'completed',
        createdAt: new Date(),
      });

      giftCard.redemptionsCount += 1;
      await Promise.all([user.save({ session }), txn.save({ session }), giftCard.save({ session })]);
      await session.commitTransaction();

      return {
        success: true,
        message: 'Gift card redeemed successfully',
        data: { newBalance: user.wallet.balance },
      };
    } catch (error: any) {
      await session.abortTransaction();
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
