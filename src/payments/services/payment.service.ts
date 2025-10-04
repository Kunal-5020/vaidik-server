// src/payments/services/payment.service.ts (Fixed)
import { 
  Injectable, 
  BadRequestException, 
  InternalServerErrorException,
  NotFoundException,
  Logger 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import { PaymentOrder, PaymentOrderDocument } from '../schemas/payment-order.schema';
import { WalletTransaction, WalletTransactionDocument } from '../schemas/wallet-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

import { RazorpayService } from './razorpay.service';
import { CreateOrderDto } from '../dto/orders/create-order.dto';
import { VerifyPaymentDto } from '../dto/verification/verify-payment.dto';
import { TransactionQueryDto } from '../dto/transactions/transaction-query.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(PaymentOrder.name) private paymentOrderModel: Model<PaymentOrderDocument>,
    @InjectModel(WalletTransaction.name) private walletTransactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private razorpayService: RazorpayService,
    private configService: ConfigService,
  ) {}

  /**
   * Create payment order
   */
  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    const { amount, purpose, astrologerId, sessionId, notes } = createOrderDto;

    try {
      // Validate amount
      if (amount < 1 || amount > 50000) {
        throw new BadRequestException('Amount must be between ₹1 and ₹50,000');
      }

      // Get user details for prefill
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Convert amount to paise
      const amountInPaise = Math.round(amount * 100);

      // Generate unique receipt ID
      const receipt = `${purpose}_${userId.substring(0, 8)}_${Date.now()}`;

      // Create Razorpay order
      const razorpayOrder = await this.razorpayService.createOrder({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          userId,
          purpose,
          astrologerId: astrologerId || '',
          sessionId: sessionId || '',
          customNotes: notes || '',
        },
      });

      // Save order to database
      const paymentOrder = new this.paymentOrderModel({
        orderId: razorpayOrder.id,
        userId,
        astrologerId,
        amount: amountInPaise,
        currency: 'INR',
        purpose,
        status: 'created',
        serviceSessionId: sessionId,
        razorpayResponse: razorpayOrder,
        userDetails: {
          name: (user as any).name || (user as any).phoneNumber,
          email: (user as any).profile?.email || (user as any).email, // ✅ Fixed: Check both locations
          contact: (user as any).phoneNumber,
        },
        notes,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      });

      await paymentOrder.save();

      // Get Razorpay client config
      const clientConfig = this.razorpayService.getClientConfig();

      return {
        success: true,
        data: {
          orderId: razorpayOrder.id,
          amount: amountInPaise,
          currency: 'INR',
          purpose,
          receipt,
          // Razorpay checkout options for frontend
          razorpayOptions: {
            key: clientConfig.keyId,
            amount: amountInPaise,
            currency: 'INR',
            name: 'VaidikTalk',
            description: this.getPaymentDescription(purpose),
            order_id: razorpayOrder.id,
            prefill: {
              name: (user as any).name || '',
              email: (user as any).profile?.email || (user as any).email || '', // ✅ Fixed: Check both locations
              contact: (user as any).phoneNumber || '',
            },
            theme: {
              color: '#FF6B35'
            },
            modal: {
              ondismiss: () => {
                console.log('Payment cancelled');
              }
            }
          }
        },
        message: 'Payment order created successfully',
      };

    } catch (error) {
      this.logger.error(`Error creating payment order: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create payment order');
    }
  }

  /**
   * Verify payment and process transaction
   */
  async verifyPayment(userId: string, verifyPaymentDto: VerifyPaymentDto) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = verifyPaymentDto;

    try {
      // Find payment order
      const paymentOrder = await this.paymentOrderModel.findOne({
        orderId: razorpay_order_id,
        userId,
      });

      if (!paymentOrder) {
        throw new BadRequestException('Payment order not found');
      }

      if (paymentOrder.status !== 'created') {
        throw new BadRequestException(`Order already ${paymentOrder.status}`);
      }

      // Check if order is expired
      if (new Date() > paymentOrder.expiresAt) {
        await this.paymentOrderModel.findByIdAndUpdate(paymentOrder._id, {
          status: 'failed',
          failureReason: 'Order expired',
        });
        throw new BadRequestException('Payment order expired');
      }

      // Verify signature
      const isValidSignature = this.razorpayService.verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValidSignature) {
        await this.paymentOrderModel.findByIdAndUpdate(paymentOrder._id, {
          status: 'failed',
          failureReason: 'Invalid signature',
        });
        throw new BadRequestException('Payment verification failed');
      }

      // Get payment details from Razorpay
      const paymentDetails = await this.razorpayService.getPaymentDetails(razorpay_payment_id);

      // Update payment order
      await this.paymentOrderModel.findByIdAndUpdate(paymentOrder._id, {
        status: 'paid',
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        paidAt: new Date(),
        razorpayResponse: { ...paymentOrder.razorpayResponse, payment: paymentDetails },
      });

      // Process the payment based on purpose
      const transactionResult = await this.processPaymentSuccess(paymentOrder, razorpay_payment_id);

      return {
        success: true,
        data: {
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: paymentOrder.amount / 100, // Convert to rupees
          purpose: paymentOrder.purpose,
          status: 'completed',
          transactionId: transactionResult.transactionId,
          newWalletBalance: transactionResult.newBalance,
        },
        message: 'Payment verified and processed successfully',
      };

    } catch (error) {
      this.logger.error(`Payment verification error: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Payment verification failed');
    }
  }

  /**
   * Get payment orders for user
   */
  async getPaymentOrders(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.paymentOrderModel
        .find({ userId })
        .populate('astrologerId', 'personalInfo.name profileImage') // ✅ Fixed: Use correct astrologer fields
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.paymentOrderModel.countDocuments({ userId }),
    ]);

    const formattedOrders = orders.map(order => ({
      id: order._id,
      orderId: order.orderId,
      paymentId: order.paymentId,
      amount: order.amount / 100, // Convert to rupees
      purpose: order.purpose,
      status: order.status,
      astrologer: order.astrologerId ? {
        id: (order.astrologerId as any)._id,
        name: (order.astrologerId as any).personalInfo?.name, // ✅ Fixed: Proper field access
        profileImage: (order.astrologerId as any).profileImage,
      } : null,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      notes: order.notes,
    }));

    return {
      success: true,
      data: {
        orders: formattedOrders,
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
   * Get wallet transactions
   */
  async getWalletTransactions(userId: string, queryDto: TransactionQueryDto) {
    const { page = 1, limit = 20, type, purpose, startDate, endDate } = queryDto;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = { userId };
    if (type) filter.type = type;
    if (purpose) filter.purpose = purpose;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.walletTransactionModel
        .find(filter)
        .populate('astrologerId', 'personalInfo.name profileImage') // ✅ Fixed: Use correct astrologer fields
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.walletTransactionModel.countDocuments(filter),
    ]);

    const formattedTransactions = transactions.map(txn => ({
      id: txn._id,
      transactionId: txn.transactionId,
      type: txn.type,
      amount: txn.amount,
      balanceAfter: txn.balanceAfter,
      purpose: txn.purpose,
      status: txn.status,
      description: txn.description,
      astrologer: txn.astrologerId ? {
        id: (txn.astrologerId as any)._id,
        name: (txn.astrologerId as any).personalInfo?.name, // ✅ Fixed: Proper field access
        profileImage: (txn.astrologerId as any).profileImage,
      } : null,
      createdAt: txn.createdAt,
      sessionId: txn.sessionId,
    }));

    return {
      success: true,
      data: {
        transactions: formattedTransactions,
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
   * Get wallet summary
   */
  async getWalletSummary(userId: string) {
    const user = await this.userModel.findById(userId).select('wallet');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get transaction statistics
    const [creditTotal, debitTotal, lastTransaction] = await Promise.all([
      this.walletTransactionModel.aggregate([
        { $match: { userId: userId, type: 'credit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      this.walletTransactionModel.aggregate([
        { $match: { userId: userId, type: 'debit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      this.walletTransactionModel.findOne(
        { userId },
        {},
        { sort: { createdAt: -1 } }
      ),
    ]);

    return {
      success: true,
      data: {
        currentBalance: (user as any).wallet?.balance || 0,
        totalRecharged: creditTotal[0]?.total || 0,
        totalSpent: debitTotal[0]?.total || 0,
        currency: 'INR',
        lastTransaction: lastTransaction ? {
          id: lastTransaction._id,
          type: lastTransaction.type,
          amount: lastTransaction.amount,
          purpose: lastTransaction.purpose,
          createdAt: lastTransaction.createdAt,
        } : null,
      },
    };
  }

  // Private helper methods
  private async processPaymentSuccess(paymentOrder: PaymentOrderDocument, paymentId: string) {
    const { userId, astrologerId, amount, purpose } = paymentOrder;
    const amountInRupees = amount / 100;

    switch (purpose) {
      case 'wallet_recharge':
        return this.processWalletRecharge(userId.toString(), amountInRupees, (paymentOrder._id as string).toString()); // ✅ Fixed: Cast _id
      
      case 'call_payment':
        return this.processServicePayment(
          userId.toString(), 
          astrologerId?.toString() || null, // ✅ Fixed: Handle optional astrologerId
          amountInRupees, 
          'call_payment',
          (paymentOrder._id as string).toString(), // ✅ Fixed: Cast _id
          paymentOrder.serviceSessionId
        );
      
      case 'chat_payment':
        return this.processServicePayment(
          userId.toString(), 
          astrologerId?.toString() || null, // ✅ Fixed: Handle optional astrologerId
          amountInRupees, 
          'chat_payment',
          (paymentOrder._id as string).toString(), // ✅ Fixed: Cast _id
          paymentOrder.serviceSessionId
        );
      
      case 'stream_tip':
        return this.processStreamTip(
          userId.toString(), 
          astrologerId?.toString() || null, // ✅ Fixed: Handle optional astrologerId
          amountInRupees, 
          (paymentOrder._id as string).toString() // ✅ Fixed: Cast _id
        );
      
      default:
        throw new Error(`Unknown payment purpose: ${purpose}`);
    }
  }

  private async processWalletRecharge(userId: string, amount: number, paymentOrderId: string) {
    // Get current user wallet
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = (user as any).wallet?.balance || 0;
    const newBalance = currentBalance + amount;

    // Update user wallet
    await this.userModel.findByIdAndUpdate(userId, {
      'wallet.balance': newBalance,
      'wallet.totalRecharged': ((user as any).wallet?.totalRecharged || 0) + amount,
      'wallet.lastRechargeAt': new Date(),
    });

    // Create wallet transaction
    const transactionId = `TXN_${Date.now()}_${userId.substring(-8)}`;
    
    const transaction = new this.walletTransactionModel({
      transactionId,
      userId,
      type: 'credit',
      amount,
      balanceAfter: newBalance,
      purpose: 'wallet_recharge',
      status: 'completed',
      description: `Wallet recharged with ₹${amount}`,
      paymentOrderId,
    });

    await transaction.save();

    this.logger.log(`✅ Wallet recharged: User ${userId} added ₹${amount}, new balance: ₹${newBalance}`);

    return {
      transactionId,
      newBalance,
      amountAdded: amount,
    };
  }

  private async processServicePayment(
    userId: string, 
    astrologerId: string | null, // ✅ Fixed: Allow null
    amount: number, 
    serviceType: string,
    paymentOrderId: string,
    sessionId?: string
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = (user as any).wallet?.balance || 0;
    const newBalance = Math.max(0, currentBalance - amount);

    // Update user wallet
    await this.userModel.findByIdAndUpdate(userId, {
      'wallet.balance': newBalance,
      'wallet.totalSpent': ((user as any).wallet?.totalSpent || 0) + amount,
    });

    // Create user transaction (debit)
    const userTransactionId = `TXN_${Date.now()}_${userId.substring(-8)}`;
    
    const userTransaction = new this.walletTransactionModel({
      transactionId: userTransactionId,
      userId,
      astrologerId,
      type: 'debit',
      amount,
      balanceAfter: newBalance,
      purpose: serviceType,
      status: 'completed',
      description: `Payment for ${serviceType.replace('_', ' ')} service - ₹${amount}`,
      paymentOrderId,
      sessionId,
    });

    await userTransaction.save();

    // Process astrologer commission (70% for services)
    if (astrologerId) {
      const commission = amount * 0.70; // 70% to astrologer
      const astrologerTransactionId = `TXN_${Date.now()}_${astrologerId.substring(-8)}`;
      
      const astrologerTransaction = new this.walletTransactionModel({
        transactionId: astrologerTransactionId,
        userId, // Reference to the user who paid
        astrologerId,
        type: 'credit',
        amount: commission,
        balanceAfter: 0, // Will be updated when astrologer wallet is implemented
        purpose: 'commission',
        status: 'completed',
        description: `Commission from ${serviceType.replace('_', ' ')} - ₹${commission.toFixed(2)}`,
        paymentOrderId,
        sessionId,
      });

      await astrologerTransaction.save();

      this.logger.log(`✅ Service payment processed: ₹${amount}, Commission: ₹${commission.toFixed(2)}`);
    }

    return {
      transactionId: userTransactionId,
      newBalance,
      amountDeducted: amount,
    };
  }

  private async processStreamTip(userId: string, astrologerId: string | null, amount: number, paymentOrderId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = (user as any).wallet?.balance || 0;
    const newBalance = Math.max(0, currentBalance - amount);

    // Update user wallet
    await this.userModel.findByIdAndUpdate(userId, {
      'wallet.balance': newBalance,
      'wallet.totalSpent': ((user as any).wallet?.totalSpent || 0) + amount,
    });

    // Create user transaction (debit)
    const userTransactionId = `TXN_${Date.now()}_${userId.substring(-8)}`;
    
    const userTransaction = new this.walletTransactionModel({
      transactionId: userTransactionId,
      userId,
      astrologerId,
      type: 'debit',
      amount,
      balanceAfter: newBalance,
      purpose: 'stream_tip',
      status: 'completed',
      description: `Stream tip sent - ₹${amount}`,
      paymentOrderId,
    });

    await userTransaction.save();

    // Process astrologer tip commission (85% for tips)
    if (astrologerId) {
      const commission = amount * 0.85; // 85% to astrologer for tips
      const astrologerTransactionId = `TXN_${Date.now()}_${astrologerId.substring(-8)}`;
      
      const astrologerTransaction = new this.walletTransactionModel({
        transactionId: astrologerTransactionId,
        userId,
        astrologerId,
        type: 'credit',
        amount: commission,
        balanceAfter: 0,
        purpose: 'tip_commission',
        status: 'completed',
        description: `Tip earnings - ₹${commission.toFixed(2)}`,
        paymentOrderId,
      });

      await astrologerTransaction.save();

      this.logger.log(`✅ Stream tip processed: ₹${amount}, Commission: ₹${commission.toFixed(2)}`);
    }

    return {
      transactionId: userTransactionId,
      newBalance,
      amountDeducted: amount,
    };
  }

  private getPaymentDescription(purpose: string): string {
    const descriptions = {
      wallet_recharge: 'Wallet Recharge - VaidikTalk',
      call_payment: 'Astrology Consultation Call - VaidikTalk',
      chat_payment: 'Astrology Consultation Chat - VaidikTalk',
      stream_tip: 'Live Stream Tip - VaidikTalk',
    };

    return descriptions[purpose] || 'VaidikTalk Payment';
  }
}
