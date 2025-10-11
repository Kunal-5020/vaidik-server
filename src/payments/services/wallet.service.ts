import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  constructor(
    @InjectModel(WalletTransaction.name) 
    private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name) 
    private userModel: Model<UserDocument>,
    private razorpayService: RazorpayService,
    private stripeService: StripeService,
    private paypalService: PayPalService,
  ) {}

  // ✅ Gateway Factory
  private getPaymentGateway(gateway: string): PaymentGatewayService {
    switch (gateway) {
      case 'razorpay':
        return this.razorpayService;
      case 'stripe':
        return this.stripeService;
      case 'paypal':
        return this.paypalService;
      default:
        throw new BadRequestException('Unsupported payment gateway');
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

    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

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
}
