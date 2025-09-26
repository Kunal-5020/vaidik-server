import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class CallBillingService {
  private readonly logger = new Logger(CallBillingService.name);

  constructor(
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // Calculate call billing based on duration
  calculateBilling(durationSeconds: number, ratePerMinute: number): {
    duration: number;
    chargeableMinutes: number;
    totalAmount: number;
  } {
    // Minimum 1 minute billing
    const chargeableMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const totalAmount = chargeableMinutes * ratePerMinute;

    return {
      duration: durationSeconds,
      chargeableMinutes,
      totalAmount
    };
  }

  // Process real-time billing during call (every minute)
  async processRealTimeBilling(callId: string): Promise<boolean> {
    try {
      const callSession = await this.callSessionModel.findOne({ callId });
      
      if (!callSession || callSession.status !== 'connected') {
        return false;
      }

      const user = await this.userModel.findById(callSession.userId);
      
      if (!user || user.wallet.balance < callSession.ratePerMinute) {
        // Insufficient balance - end call
        await this.endCallDueToInsufficientBalance(callSession);
        return false;
      }

      // Deduct per minute amount
      user.wallet.balance -= callSession.ratePerMinute;
      user.wallet.totalSpent += callSession.ratePerMinute;
      
      // Add transaction
      user.walletTransactions.push({
        transactionId: `call_${callId}_${Date.now()}`,
        type: 'deduction',
        amount: -callSession.ratePerMinute,
        description: `Per-minute billing for ongoing call`,
        orderId: callId,
        balanceAfter: user.wallet.balance,
        createdAt: new Date()
      } as any);

      await user.save();

      // Update call session total amount
      callSession.totalAmount += callSession.ratePerMinute;
      await callSession.save();

      this.logger.log(`💰 Real-time billing: ₹${callSession.ratePerMinute} deducted for call ${callId}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Real-time billing failed for call ${callId}: ${error.message}`);
      return false;
    }
  }

  // End call due to insufficient balance
  private async endCallDueToInsufficientBalance(callSession: CallSessionDocument): Promise<void> {
    callSession.status = 'ended';
    callSession.endedAt = new Date();
    callSession.endReason = 'insufficient_balance';
    
    if (callSession.startedAt) {
      const durationMs = callSession.endedAt.getTime() - callSession.startedAt.getTime();
      callSession.duration = Math.floor(durationMs / 1000);
    }

    await callSession.save();
    
    this.logger.log(`💸 Call ${callSession.callId} ended due to insufficient balance`);
  }

  // Get billing summary for a period
  async getBillingSummary(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<{
    totalCalls: number;
    totalMinutes: number;
    totalAmount: number;
    averageCallDuration: number;
    callBreakdown: { audio: number; video: number };
  }> {
    const calls = await this.callSessionModel.find({
      $or: [{ userId }, { astrologerId: userId }],
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'ended'
    });

    const totalCalls = calls.length;
    const totalMinutes = calls.reduce((sum, call) => sum + Math.ceil((call.duration || 0) / 60), 0);
    const totalAmount = calls.reduce((sum, call) => sum + (call.totalAmount || 0), 0);
    const averageCallDuration = totalCalls > 0 ? Math.floor(calls.reduce((sum, call) => sum + (call.duration || 0), 0) / totalCalls) : 0;

    const callBreakdown = {
      audio: calls.filter(call => call.callType === 'audio').length,
      video: calls.filter(call => call.callType === 'video').length
    };

    return {
      totalCalls,
      totalMinutes,
      totalAmount,
      averageCallDuration,
      callBreakdown
    };
  }
}
