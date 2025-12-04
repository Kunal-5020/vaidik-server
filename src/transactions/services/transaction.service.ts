// src/transactions/services/transaction.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument } from '../schemas/transaction.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(Astrologer.name)
    private astrologerModel: Model<AstrologerDocument>,
  ) {}

  /**
   * Create transaction
   */
  async createTransaction(data: {
    astrologerId: string;
    type: 'credit' | 'debit';
    amount: number;
    description: string;
    category: string;
    orderId?: string;
    payoutId?: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }): Promise<TransactionDocument> {
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Get current balance
    const astrologer = await this.astrologerModel
      .findById(data.astrologerId)
      .select('earnings')
      .lean();

    const balanceBefore = astrologer?.earnings?.withdrawableAmount || 0;
    const balanceAfter = data.type === 'credit' 
      ? balanceBefore + data.amount 
      : balanceBefore - data.amount;

    const transaction = new this.transactionModel({
      transactionId,
      astrologerId: data.astrologerId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      category: data.category,
      orderId: data.orderId,
      payoutId: data.payoutId,
      userId: data.userId,
      sessionId: data.sessionId,
      metadata: data.metadata,
      balanceBefore,
      balanceAfter,
      status: 'completed',
      createdAt: new Date(),
    });

    await transaction.save();

    console.log(`💰 [Transaction] Created: ${transactionId} | ${data.type} | ₹${data.amount}`);

    return transaction;
  }

  /**
   * Get astrologer transactions
   */
  async getAstrologerTransactions(
    astrologerId: string,
    page: number = 1,
    limit: number = 20,
    type?: 'credit' | 'debit',
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { astrologerId };

    if (type) {
      query.type = type;
    }

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

  /**
   * Get transaction details
   */
  async getTransactionDetails(
    transactionId: string,
    astrologerId: string,
  ): Promise<any> {
    const transaction = await this.transactionModel
      .findOne({ transactionId, astrologerId })
      .lean();

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      success: true,
      data: transaction,
    };
  }

  /**
   * Get transaction summary
   */
  async getTransactionSummary(
    astrologerId: string,
    period: 'week' | 'month' | 'year' = 'month',
  ): Promise<any> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const [credits, debits, totalTransactions] = await Promise.all([
      this.transactionModel.aggregate([
        {
          $match: {
            astrologerId,
            type: 'credit',
            createdAt: { $gte: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        {
          $match: {
            astrologerId,
            type: 'debit',
            createdAt: { $gte: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.countDocuments({
        astrologerId,
        createdAt: { $gte: startDate },
      }),
    ]);

    return {
      success: true,
      data: {
        period,
        totalCredits: credits[0]?.total || 0,
        totalDebits: debits[0]?.total || 0,
        netAmount: (credits[0]?.total || 0) - (debits[0]?.total || 0),
        totalTransactions,
      },
    };
  }
}
