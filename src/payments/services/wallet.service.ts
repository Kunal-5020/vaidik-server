import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from '../schemas/wallet-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { RazorpayService } from './razorpay.service';
import { StripeService } from './stripe.service';
import { PayPalService } from './paypal.service';
import { PaymentGatewayService } from './payment-gateway.service';


@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    @InjectModel(WalletTransaction.name) 
    private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private razorpayService: RazorpayService,
    private stripeService: StripeService,
    private paypalService: PayPalService,
  ) {}

  private generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  // ✅ Gateway Factory
  private getPaymentGateway(gateway: string): PaymentGatewayService {
  const normalizedGateway = gateway?.toLowerCase(); // ✅ Normalize
  
  switch (normalizedGateway) {
    case 'razorpay':
      return this.razorpayService;
    case 'stripe':
      return this.stripeService;
    case 'paypal':
      return this.paypalService;
    default:
      throw new BadRequestException(
        `Unsupported payment gateway: ${gateway}. Supported: razorpay, stripe, paypal`
      );
  }
}

  // ✅ UPDATED: Create recharge with gateway integration
  async createRechargeTransaction(
    userId: string,
    amount: number,
    paymentGateway: string,
    currency?: string
  ): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Then use it:
    const transactionId = this.generateTransactionId('TXN');

    // Create transaction record
    const transaction = new this.transactionModel({
      transactionId,
      userId,
      type: 'recharge',
      amount,
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance,
      description: `Wallet recharge of ${currency || 'INR'} ${amount}`,
      paymentGateway,
      status: 'pending',
      createdAt: new Date()
    });

    await transaction.save();

    // ✅ Create order in payment gateway
    const gateway = this.getPaymentGateway(paymentGateway);
    const gatewayResponse = await gateway.createOrder(
      amount,
      currency || 'INR',
      userId,
      transactionId
    );

    return {
      success: true,
      message: 'Recharge transaction created',
      data: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: gatewayResponse.currency,
        status: transaction.status,
        gateway: paymentGateway,
        gatewayOrderId: gatewayResponse.gatewayOrderId,
        clientSecret: gatewayResponse.clientSecret, // For Stripe
        paymentUrl: gatewayResponse.paymentUrl, // For PayPal
      }
    };
  }

  async verifyPayment(
    transactionId: string,
    paymentId: string,
    status: 'completed' | 'failed'
  ): Promise<any> {
    const transaction = await this.transactionModel.findOne({ transactionId });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== 'pending') {
      throw new BadRequestException('Transaction already processed');
    }

    transaction.paymentId = paymentId;
    transaction.status = status;

    if (status === 'completed') {
      // Update user wallet
      const user = await this.userModel.findById(transaction.userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      user.wallet.balance += transaction.amount;
      user.wallet.totalRecharged += transaction.amount;
      user.wallet.lastRechargeAt = new Date();
      user.wallet.lastTransactionAt = new Date();

      transaction.balanceAfter = user.wallet.balance;

      await user.save();
    }

    await transaction.save();

    return {
      success: true,
      message: status === 'completed' ? 'Payment verified successfully' : 'Payment failed',
      data: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        balanceAfter: transaction.balanceAfter
      }
    };
  }

  // ===== DEDUCT FROM WALLET =====

  async deductFromWallet(
    userId: string,
    amount: number,
    orderId: string,
    description: string
  ): Promise<WalletTransactionDocument> {

    if (amount <= 0) {
    throw new BadRequestException('Amount must be greater than 0');
  }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const transaction = new this.transactionModel({
      transactionId,
      userId,
      type: 'deduction',
      amount,
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance - amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date()
    });

    user.wallet.balance -= amount;
    user.wallet.totalSpent += amount;
    user.wallet.lastTransactionAt = new Date();

    await Promise.all([transaction.save(), user.save()]);

    this.logger.log(`Deducted ₹${amount} from user ${userId}`);

    return transaction;
  }

  // ===== REFUND TO WALLET =====

  async refundToWallet(
    userId: string,
    amount: number,
    orderId: string,
    description: string
  ): Promise<WalletTransactionDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const transaction = new this.transactionModel({
      transactionId,
      userId,
      type: 'refund',
      amount,
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance + amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date()
    });

    user.wallet.balance += amount;
    user.wallet.lastTransactionAt = new Date();

    await Promise.all([transaction.save(), user.save()]);

    return transaction;
  }

  // ===== GET TRANSACTIONS =====

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: string; status?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { userId };

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getTransactionDetails(transactionId: string, userId: string): Promise<any> {
    const transaction = await this.transactionModel
      .findOne({ transactionId, userId })
      .lean();

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      success: true,
      data: transaction
    };
  }

  // ===== STATISTICS =====

  async getWalletStats(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('wallet').lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [totalTransactions, rechargeTotal, spentTotal] = await Promise.all([
      this.transactionModel.countDocuments({ userId }),
      this.transactionModel.aggregate([
        { $match: { userId: userId, type: 'recharge', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      this.transactionModel.aggregate([
        { $match: { userId: userId, type: 'deduction', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    return {
      success: true,
      data: {
        currentBalance: user.wallet.balance,
        totalRecharged: rechargeTotal[0]?.total || 0,
        totalSpent: spentTotal[0]?.total || 0,
        totalTransactions,
        lastRechargeAt: user.wallet.lastRechargeAt,
        lastTransactionAt: user.wallet.lastTransactionAt
      }
    };
  }

  async creditToWallet(
    userId: string,
    amount: number,
    orderId: string,
    description: string,
    type: 'refund' | 'bonus' | 'reward' = 'refund'
  ): Promise<WalletTransactionDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const transaction = new this.transactionModel({
      transactionId,
      userId,
      type,
      amount,
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance + amount,
      description,
      orderId,
      status: 'completed',
      createdAt: new Date()
    });

    user.wallet.balance += amount;
    user.wallet.lastTransactionAt = new Date();

    // ✅ Save sequentially (no transactions for now)
    await transaction.save();
    await user.save();

    this.logger.log(`Credited ₹${amount} to user ${userId} | Type: ${type}`);

    return transaction;
  }
  // Check balance
  async checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('wallet.balance');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.wallet.balance >= requiredAmount;
  }

  // Get balance
  async getBalance(userId: string): Promise<number> {
    const user = await this.userModel.findById(userId).select('wallet.balance');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.wallet.balance;
  }

  // ✅ ADD: Get payment logs (recharge transactions with gateway details)
async getPaymentLogs(
  userId: string,
  page: number = 1,
  limit: number = 20,
  status?: string
): Promise<any> {
  const skip = (page - 1) * limit;
  const query: any = {
    userId,
    type: 'recharge' // Only recharge transactions
  };

  if (status) {
    query.status = status;
  }

  const [logs, total] = await Promise.all([
    this.transactionModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('transactionId amount paymentGateway paymentId status description createdAt')
      .lean(),
    this.transactionModel.countDocuments(query)
  ]);

  return {
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
}

// ===== PAYMENT HOLD SYSTEM (for Orders) =====

/**
 * ✅ HOLD amount (temporary - not charged yet)
 * Called when: User initiates chat/call
 * Held for: 3-5 minutes (waiting for astrologer response)
 * Released if: Rejected, Timeout, or User cancels
 * Converted to: Charge (if session actually happens)
 */
async holdAmount(
  userId: string,
  amount: number,
  orderId: string,
  description: string
): Promise<any> {
  if (amount <= 0) {
    throw new BadRequestException('Amount must be greater than 0');
  }

  const user = await this.userModel.findById(userId);
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // ✅ Verify balance before holding
  if (user.wallet.balance < amount) {
    throw new BadRequestException(
      `Insufficient balance. Need ₹${amount}, have ₹${user.wallet.balance}`
    );
  }

  const transactionId = this.generateTransactionId('HOLD');

  // ✅ Create hold transaction
  const transaction = new this.transactionModel({
    transactionId,
    userId,
    type: 'hold',
    amount,
    orderId,
    status: 'pending', // Hold is pending (not completed)
    balanceBefore: user.wallet.balance,
    balanceAfter: user.wallet.balance, // Hold doesn't reduce actual balance yet
    description: `HOLD: ${description}`,
    holdReleaseableAt: new Date(Date.now() + 5 * 60 * 1000), // Auto-release after 5 mins if not converted
    createdAt: new Date()
  });

  await transaction.save();

  this.logger.log(`Amount held: ₹${amount} for order ${orderId} | Transaction: ${transactionId}`);

  return {
    transactionId: transaction.transactionId,
    holdAmount: amount,
    message: 'Amount held successfully'
  };
}

/**
 * ✅ CHARGE from HOLD (convert hold to actual charge)
 * Called when: Session ends and billing is calculated
 * Converts: HOLD transaction to CHARGE transaction
 * Deducts: From actual balance
 * Refunds: Unused hold amount
 */
async chargeFromHold(
  userId: string,
  chargeAmount: number,
  orderId: string,
  description: string
): Promise<any> {
  const user = await this.userModel.findById(userId);
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // ✅ Find the hold transaction
  const holdTransaction = await this.transactionModel.findOne({
    userId,
    orderId,
    type: 'hold',
    status: 'pending'
  });

  if (!holdTransaction) {
    throw new BadRequestException('No hold transaction found for this order');
  }

  const heldAmount = holdTransaction.amount;

  if (chargeAmount > heldAmount) {
    throw new BadRequestException(
      `Charge amount (₹${chargeAmount}) exceeds held amount (₹${heldAmount})`
    );
  }

  // ✅ Verify wallet still has balance
  if (user.wallet.balance < chargeAmount) {
    throw new BadRequestException('Insufficient wallet balance to charge');
  }

  try {
    const chargeTransactionId = this.generateTransactionId('CHARGE');

    // ✅ Mark hold as completed
    holdTransaction.status = 'converted_to_charge';
    holdTransaction.convertedAt = new Date();
    holdTransaction.linkedTransactionId = chargeTransactionId;
    await holdTransaction.save();

    // ✅ Create charge transaction
    const chargeTransaction = new this.transactionModel({
      transactionId: chargeTransactionId,
      userId,
      type: 'charge',
      amount: chargeAmount,
      orderId,
      status: 'completed',
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance - chargeAmount,
      description: `CHARGE: ${description}`,
      linkedHoldTransactionId: holdTransaction.transactionId,
      createdAt: new Date()
    });

    // ✅ Deduct from wallet
    user.wallet.balance -= chargeAmount;
    user.wallet.totalSpent += chargeAmount;
    user.wallet.lastTransactionAt = new Date();

    await chargeTransaction.save();
    await user.save();

    this.logger.log(
      `Charged from hold: ₹${chargeAmount} for order ${orderId} | Balance: ₹${user.wallet.balance}`
    );

    return {
      transactionId: chargeTransaction.transactionId,
      chargedAmount: chargeAmount,
      balanceAfter: user.wallet.balance,
      message: 'Charged successfully'
    };
  } catch (error: any) {
    this.logger.error(`Charge from hold failed: ${error.message}`);
    throw new BadRequestException(`Charge failed: ${error.message}`);
  }
}

/**
 * ✅ RELEASE HOLD (refund held amount)
 * Called when: Astrologer rejects, Timeout, User cancels (before session starts)
 * Action: Marks hold as released (no actual transaction, just state change)
 * Result: User gets full held amount back automatically
 */
async releaseHold(
  userId: string,
  releaseAmount: number,
  orderId: string,
  description: string
): Promise<any> {
  const user = await this.userModel.findById(userId);
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // ✅ Find the hold transaction
  const holdTransaction = await this.transactionModel.findOne({
    userId,
    orderId,
    type: 'hold',
    status: 'pending'
  });

  if (!holdTransaction) {
    throw new BadRequestException('No hold transaction found to release');
  }

  try {
    const refundTransactionId = this.generateTransactionId('REFUND');

    // ✅ Mark hold as released
    holdTransaction.status = 'released';
    holdTransaction.releasedAt = new Date();
    holdTransaction.linkedTransactionId = refundTransactionId;
    await holdTransaction.save();

    // ✅ Create refund transaction (record only - balance already untouched)
    const refundTransaction = new this.transactionModel({
      transactionId: refundTransactionId,
      userId,
      type: 'refund',
      amount: releaseAmount,
      orderId,
      status: 'completed',
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance, // No actual deduction
      description: `REFUND (Hold released): ${description}`,
      linkedHoldTransactionId: holdTransaction.transactionId,
      createdAt: new Date()
    });

    user.wallet.lastTransactionAt = new Date();

    await refundTransaction.save();
    await user.save();

    this.logger.log(`Hold released: ₹${releaseAmount} for order ${orderId}`);

    return {
      transactionId: refundTransaction.transactionId,
      refundedAmount: releaseAmount,
      balanceAfter: user.wallet.balance,
      message: 'Hold released and amount refunded'
    };
  } catch (error: any) {
    this.logger.error(`Release hold failed: ${error.message}`);
    throw new BadRequestException(`Release failed: ${error.message}`);
  }
}

/**
 * ✅ REFUND UNUSED AMOUNT (after session charged)
 * Called when: Charge from hold leaves unused balance
 * Example: Held ₹100, charged ₹60, refund ₹40
 */
async refundUnusedAmount(
  userId: string,
  refundAmount: number,
  orderId: string,
  description: string
): Promise<any> {
  const user = await this.userModel.findById(userId);
  if (!user) {
    throw new NotFoundException('User not found');
  }

  try {
    const refundTransactionId = this.generateTransactionId('REFUND');

    // ✅ Create refund transaction
    const refundTransaction = new this.transactionModel({
      transactionId: refundTransactionId,
      userId,
      type: 'refund',
      amount: refundAmount,
      orderId,
      status: 'completed',
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance + refundAmount,
      description: `REFUND (Unused): ${description}`,
      createdAt: new Date()
    });

    // ✅ Credit back to wallet
    user.wallet.balance += refundAmount;
    user.wallet.lastTransactionAt = new Date();

    await refundTransaction.save();
    await user.save();

    this.logger.log(`Refunded unused amount: ₹${refundAmount} to user ${userId}`);

    return {
      transactionId: refundTransaction.transactionId,
      refundedAmount: refundAmount,
      balanceAfter: user.wallet.balance,
      message: 'Unused amount refunded'
    };
  } catch (error: any) {
    this.logger.error(`Refund unused failed: ${error.message}`);
    throw new BadRequestException(`Refund failed: ${error.message}`);
  }
}

/**
 * ✅ GET WALLET WITH HOLD STATUS
 * Shows: Current balance + held amount + available balance
 */
async getWalletWithHold(userId: string): Promise<any> {
  const user = await this.userModel.findById(userId).select('wallet').lean();
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // ✅ Calculate total held amount
  const [heldTransactions] = await Promise.all([
    this.transactionModel.aggregate([
      { $match: { userId: userId, type: 'hold', status: 'pending' } },
      { $group: { _id: null, totalHeld: { $sum: '$amount' } } }
    ])
  ]);

  const totalHeld = heldTransactions[0]?.totalHeld || 0;
  const availableBalance = user.wallet.balance - totalHeld;

  return {
    success: true,
    data: {
      currentBalance: user.wallet.balance,
      totalHeld: totalHeld,
      availableBalance: Math.max(0, availableBalance), // Never negative
      canStartSession: availableBalance >= 0
    }
  };
}

}
