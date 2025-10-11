import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { WalletService } from '../../payments/services/wallet.service';
import { EarningsService } from '../../astrologers/services/earnings.service';

@Injectable()
export class CallBillingService {
  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private walletService: WalletService,
    private earningsService: EarningsService,
  ) {}

  // Calculate billing amount
  calculateBilling(durationSeconds: number, ratePerMinute: number, commissionRate: number = 20): any {
    // Round up to nearest minute for billing
    const billedMinutes = Math.ceil(durationSeconds / 60);
    const totalAmount = billedMinutes * ratePerMinute;
    const platformCommission = (totalAmount * commissionRate) / 100;
    const astrologerEarning = totalAmount - platformCommission;

    return {
      billedDuration: billedMinutes * 60, // Convert back to seconds
      billedMinutes,
      totalAmount,
      platformCommission,
      astrologerEarning
    };
  }

  // Process call billing after call ends
  async processCallBilling(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.isPaid) {
      return { success: false, message: 'Call already billed' };
    }

    // Calculate billing
    const billing = this.calculateBilling(
      session.duration,
      session.ratePerMinute,
      20 // 20% platform commission
    );

    // Update session with billing details
    session.billedDuration = billing.billedDuration;
    session.totalAmount = billing.totalAmount;
    session.platformCommission = billing.platformCommission;
    session.astrologerEarning = billing.astrologerEarning;
    session.isPaid = true;
    session.paidAt = new Date();

    await session.save();

    // Deduct from user wallet
    try {
      await this.walletService.deductFromWallet(
        session.userId.toString(),
        billing.totalAmount,
        session.orderId,
        `Call session: ${sessionId}`
      );

      // Credit astrologer earnings
      await this.earningsService.updateEarnings(
        session.astrologerId.toString(),
        billing.astrologerEarning,
        'call'
      );

      return {
        success: true,
        message: 'Billing processed successfully',
        billing: {
          billedMinutes: billing.billedMinutes,
          totalAmount: billing.totalAmount,
          platformCommission: billing.platformCommission,
          astrologerEarning: billing.astrologerEarning
        }
      };
    } catch (error: any) {
      // Rollback billing status if payment fails
      session.isPaid = false;
      session.paidAt = undefined;
      await session.save();

      throw new Error(`Billing failed: ${error.message}`);
    }
  }

  // Get billing summary for session
  async getBillingSummary(sessionId: string): Promise<any> {
    const session = await this.sessionModel
      .findOne({ sessionId })
      .select('duration billedDuration totalAmount platformCommission astrologerEarning isPaid paidAt')
      .lean();

    if (!session) {
      throw new Error('Session not found');
    }

    return {
      success: true,
      data: {
        duration: session.duration,
        billedDuration: session.billedDuration,
        billedMinutes: Math.ceil(session.duration / 60),
        totalAmount: session.totalAmount,
        platformCommission: session.platformCommission,
        astrologerEarning: session.astrologerEarning,
        isPaid: session.isPaid,
        paidAt: session.paidAt
      }
    };
  }

  // Real-time billing calculation (for showing to user during call)
  async calculateRealTimeBilling(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session || !session.startTime) {
      throw new Error('Session not active');
    }

    const now = new Date();
    const durationSeconds = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

    const billing = this.calculateBilling(durationSeconds, session.ratePerMinute, 20);

    return {
      success: true,
      data: {
        currentDuration: durationSeconds,
        billedMinutes: billing.billedMinutes,
        estimatedAmount: billing.totalAmount
      }
    };
  }
}
