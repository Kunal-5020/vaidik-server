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
   * Enforces minimum 1 minute charge logic
   */
  calculateBilling(
    durationSeconds: number,
    ratePerMinute: number,
    commissionRate: number = 20
  ): any {
    // ✅ Logic: 
    // 0-60s -> 1 min
    // 61-120s -> 2 mins
    // If duration is 0 but call started, usually we typically charge 1 min if connected
    
    let billedMinutes = Math.ceil(durationSeconds / 60);
    if (billedMinutes < 1) billedMinutes = 1; // Enforce minimum 1 min

    const billedDuration = billedMinutes * 60; 
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
   * ✅ Process call billing after call ends
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
      20
    );

    // Update session
    session.billedDuration = billing.billedDuration;
    session.billedMinutes = billing.billedMinutes;
    session.totalAmount = billing.totalAmount;
    session.platformCommission = billing.platformCommission;
    session.astrologerEarning = billing.astrologerEarning;
    session.isPaid = true;
    session.paidAt = new Date();

    await session.save();

    this.logger.log(
      `Billing computed: ${sessionId} | Duration: ${session.duration}s | Billed: ${billing.billedMinutes}m | Amount: ₹${billing.totalAmount}`
    );

    return {
      success: true,
      message: 'Billing computed successfully',
      billing: {
        actualDuration: session.duration,
        billedMinutes: billing.billedMinutes,
        totalAmount: billing.totalAmount,
        platformCommission: billing.platformCommission,
        astrologerEarning: billing.astrologerEarning
      }
    };
  }

  async getBillingSummary(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId }).lean();
    if (!session) throw new NotFoundException('Session not found');
    return { success: true, data: session };
  }

  async calculateRealTimeBilling(sessionId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session || !session.startTime) throw new NotFoundException('Session not active');

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