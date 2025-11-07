// src/calls/services/call-billing.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { WalletService } from '../../payments/services/wallet.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';

@Injectable()
export class CallBillingService {
  private readonly logger = new Logger(CallBillingService.name);

  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private walletService: WalletService,
    private orderPaymentService: OrderPaymentService
  ) {}

  /**
   * ✅ Calculate billing for a call
   */
  calculateBilling(
    durationSeconds: number,
    ratePerMinute: number,
    commissionRate: number = 20
  ): any {
    // Round up to nearest minute for billing
    const billedMinutes = Math.ceil(durationSeconds / 60);
    const billedDuration = billedMinutes * 60; // Convert back to seconds
    const totalAmount = billedMinutes * ratePerMinute;
    const platformCommission = (totalAmount * commissionRate) / 100;
    const astrologerEarning = totalAmount - platformCommission;

    return {
      billedDuration,
      billedMinutes,
      totalAmount,
      platformCommission,
      astrologerEarning
    };
  }

  /**
   * ✅ Process call billing after call ends (charge from hold)
   */
  async processCallBilling(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
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
    session.billedMinutes = billing.billedMinutes;
    session.totalAmount = billing.totalAmount;
    session.platformCommission = billing.platformCommission;
    session.astrologerEarning = billing.astrologerEarning;
    session.isPaid = true;
    session.paidAt = new Date();

    try {
      // ✅ Charge from hold (already using OrderPaymentService)
      await this.orderPaymentService.chargeFromHold(
        session.orderId,
        session.userId.toString(),
        session.duration,
        session.ratePerMinute
      );

      await session.save();

      this.logger.log(
        `Billing processed: ${sessionId} | Billed: ${billing.billedMinutes}m | Amount: ₹${billing.totalAmount}`
      );

      return {
        success: true,
        message: 'Billing processed successfully',
        billing: {
          actualDuration: session.duration,
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

      this.logger.error(`Billing failed for ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ Get billing summary for a call session
   */
  async getBillingSummary(sessionId: string): Promise<any> {
    const session = await this.sessionModel
      .findOne({ sessionId })
      .select(
        'duration billedDuration billedMinutes totalAmount platformCommission astrologerEarning isPaid paidAt'
      )
      .lean();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      success: true,
      data: {
        actualDuration: session.duration,
        billedDuration: session.billedDuration,
        billedMinutes: session.billedMinutes,
        totalAmount: session.totalAmount,
        platformCommission: session.platformCommission,
        astrologerEarning: session.astrologerEarning,
        isPaid: session.isPaid,
        paidAt: session.paidAt
      }
    };
  }

  /**
   * ✅ Real-time billing calculation (for showing to user during call)
   */
  async calculateRealTimeBilling(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session || !session.startTime) {
      throw new NotFoundException('Session not active');
    }

    const now = new Date();
    const durationSeconds = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

    const billing = this.calculateBilling(durationSeconds, session.ratePerMinute, 20);

    return {
      success: true,
      data: {
        currentDuration: durationSeconds,
        formattedTime: this.formatTime(durationSeconds),
        billedMinutes: billing.billedMinutes,
        estimatedAmount: billing.totalAmount,
        maxDurationSeconds: session.maxDurationSeconds,
        remainingSeconds: Math.max(0, session.maxDurationSeconds - durationSeconds)
      }
    };
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
