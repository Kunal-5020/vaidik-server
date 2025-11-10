// src/orders/services/order-payment.service.ts

import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../schemas/orders.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  // ✅ ADDED: All required injections
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private walletService: WalletService
  ) {}

  // ✅ ADDED: Helper method
  private generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  // ===== HOLD PAYMENT =====
  async holdPayment(
    orderId: string,
    userId: string,
    ratePerMinute: number,
    minMinutes: number = 5
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const holdAmount = ratePerMinute * minMinutes;

    // Check wallet balance
    const hasBalance = await this.walletService.checkBalance(userId, holdAmount);
    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${holdAmount} required.`
      );
    }

    // HOLD amount (not deducted yet)
    const holdTransaction = await this.walletService.holdAmount(
      userId,
      holdAmount,
      orderId,
      `Hold for ${order.type} consultation`
    );

    // Update order
    order.payment = {
      status: 'hold',
      heldAmount: holdAmount,
      chargedAmount: 0,
      refundedAmount: 0,
      holdTransactionId: holdTransaction.transactionId,
      heldAt: new Date()
    };

    await order.save();

    this.logger.log(`Payment held: ${orderId} | Amount: ₹${holdAmount}`);

    return {
      success: true,
      message: 'Payment hold successful',
      heldAmount: holdAmount
    };
  }

  // ===== CALCULATE MAX DURATION =====
  async calculateMaxDuration(
    userId: string,
    ratePerMinute: number
  ): Promise<any> {
    const walletBalance = await this.walletService.getBalance(userId);

    // Full minutes only (no fractional)
    const maxDurationMinutes = Math.floor(walletBalance / ratePerMinute);

    return {
      maxDurationMinutes,
      maxDurationSeconds: maxDurationMinutes * 60,
      walletBalance
    };
  }

  // ===== CHARGE FROM HOLD =====
  async chargeFromHold(
    orderId: string,
    userId: string,
    actualDurationSeconds: number,
    ratePerMinute: number
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Calculate billing (round UP to nearest minute)
    const billedMinutes = Math.ceil(actualDurationSeconds / 60);
    const chargeAmount = billedMinutes * ratePerMinute;

    // Ensure charge doesn't exceed held amount
    const finalCharge = Math.min(chargeAmount, order.payment.heldAmount);

    try {
      // Convert hold to actual charge
      const chargeTransaction = await this.walletService.chargeFromHold(
        userId,
        finalCharge,
        orderId,
        `${order.type} consultation: ${billedMinutes} min(s)`
      );

      // Calculate refund (unused hold amount)
      const refundAmount = order.payment.heldAmount - finalCharge;

      // Refund unused amount if any
      let refundTransaction: WalletTransactionDocument | null = null;
      if (refundAmount > 0) {
        refundTransaction = await this.walletService.refundToWallet(
          userId,
          refundAmount,
          orderId,
          'Refund: Unused balance',
          undefined, // ✅ Add optional session parameter
        );

      }

      // Update order
      order.payment.status = 'charged';
      order.payment.chargedAmount = finalCharge;
      order.payment.refundedAmount = refundAmount;
      order.payment.chargeTransactionId = chargeTransaction.transactionId;
      if (refundTransaction) {
        // ✅ FIXED: Cast to any
        order.payment.refundTransactionId = (refundTransaction as any).transactionId;
      }
      order.payment.chargedAt = new Date();

      order.status = 'completed';
      order.actualDurationSeconds = actualDurationSeconds;
      order.billedMinutes = billedMinutes;
      order.totalAmount = finalCharge;

      await order.save();

      this.logger.log(
        `Payment charged: ${orderId} | Charged: ₹${finalCharge} | Refunded: ₹${refundAmount}`
      );

      return {
        success: true,
        message: 'Payment processed successfully',
        actualDuration: actualDurationSeconds,
        billedMinutes,
        chargedAmount: finalCharge,
        refundedAmount: refundAmount
      };
    } catch (error: any) {
      // Mark as failed (keep hold active for retry)
      order.payment.status = 'failed';
      order.payment.failureReason = error.message;
      await order.save();

      this.logger.error(`Payment charge failed: ${orderId} | Error: ${error.message}`);
      throw new BadRequestException(`Payment failed: ${error.message}`);
    }
  }

  // ===== REFUND HOLD (Reject/Timeout/Cancel) =====
  async refundHold(
    orderId: string,
    userId: string,
    reason: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.payment.status !== 'hold') {
      throw new BadRequestException('Payment not in hold status');
    }

    const holdAmount = order.payment.heldAmount;

    try {
      // Release hold (refund)
      let refundTransaction: WalletTransactionDocument | null = null;
      refundTransaction = await this.walletService.refundToWallet(
          userId,
          holdAmount,
          orderId,
          `Refund: ${reason}`,
          undefined, // ✅ Add optional session parameter
        );

      // Update order
      order.payment.status = 'refunded';
      order.payment.refundedAmount = holdAmount;
      order.payment.refundTransactionId = refundTransaction.transactionId;
      order.payment.refundedAt = new Date();

      await order.save();

      this.logger.log(`Payment hold released: ${orderId} | Refunded: ₹${holdAmount}`);

      return {
        success: true,
        message: `Payment refunded: ₹${holdAmount}`,
        refundedAmount: holdAmount
      };
    } catch (error: any) {
      this.logger.error(`Refund failed: ${orderId} | Error: ${error.message}`);
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  // ===== PROCESS REFUND REQUEST =====
  async processRefundRequest(
    orderId: string,
    approve: boolean,
    adminNotes: string,
    adminId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order || !order.refundRequest) {
      throw new BadRequestException('Order or refund request not found');
    }

    if (approve) {
      const refundAmount = order.refundRequest.refundAmount || order.totalAmount;

      try {
        // Process refund
        const refundTransaction = await this.walletService.creditToWallet(
          order.userId.toString(),
          refundAmount,
          orderId,
          `Refund approved: ${orderId}`
        );

        // Update order
        order.status = 'refunded';
        order.payment.status = 'refunded';
        order.payment.refundedAmount = refundAmount;
        order.payment.refundTransactionId = refundTransaction.transactionId;
        order.payment.refundedAt = new Date();

        order.refundRequest.status = 'approved';
        order.refundRequest.processedAt = new Date();
        order.refundRequest.processedBy = new Types.ObjectId(adminId);
        order.refundRequest.adminNotes = adminNotes;

        await order.save();

        this.logger.log(`Refund approved: ${orderId} | Amount: ₹${refundAmount}`);

        return {
          success: true,
          message: 'Refund approved and processed',
          refundedAmount: refundAmount
        };
      } catch (error: any) {
        throw new BadRequestException(`Refund processing failed: ${error.message}`);
      }
    } else {
      // Reject refund
      order.status = 'completed'; // Back to completed
      order.refundRequest.status = 'rejected';
      order.refundRequest.processedAt = new Date();
      order.refundRequest.processedBy = new Types.ObjectId(adminId);
      order.refundRequest.rejectionReason = adminNotes;

      await order.save();

      this.logger.log(`Refund rejected: ${orderId}`);

      return {
        success: true,
        message: 'Refund request rejected'
      };
    }
  }

  /**
 * ✅ Check if order still has hold payment (not yet charged)
 */
async hasHold(orderId: string): Promise<boolean> {
  try {
    const order = await this.orderModel.findOne({ orderId });
    if (!order || !order.payment) {
      return false;
    }
    return order.payment.status === 'hold';
  } catch (error: any) {
    this.logger.error(`Error checking hold status: ${error.message}`);
    return false;
  }
}
}
