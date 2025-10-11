import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';
import { WalletService } from '../../payments/services/wallet.service';
import { AdminActivityLogService } from './admin-activity-log.service';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private walletService: WalletService,
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
  ) {}

  async getAllOrders(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; type?: string; startDate?: string; endDate?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;
    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('userId', 'name phoneNumber email')
        .populate('astrologerId', 'name phoneNumber email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getOrderDetails(orderId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ orderId })
      .populate('userId')
      .populate('astrologerId')
      .lean();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      success: true,
      data: order,
    };
  }

  async refundOrder(orderId: string, adminId: string, refundDto: any): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Process refund
    await this.walletService.refundToWallet(
      order.userId.toString(),
      refundDto.amount || order.totalAmount,
      orderId,
      `Refund by admin: ${refundDto.reason}`
    );

    // Update order
    order.status = 'cancelled';
    await order.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'order.refund',
      module: 'orders',
      targetId: orderId,
      targetType: 'Order',
      status: 'success',
      details: {
        amount: refundDto.amount || order.totalAmount,
        reason: refundDto.reason,
      },
    });

    // Notify user
    await this.notificationService.sendNotification({
      recipientId: order.userId.toString(),
      recipientModel: 'User',
      type: 'payment_success',
      title: 'Refund Processed',
      message: `Your refund of ₹${refundDto.amount || order.totalAmount} has been processed.`,
      priority: 'high',
    });

    return {
      success: true,
      message: 'Refund processed successfully',
    };
  }

  async cancelOrder(orderId: string, adminId: string, reason: string): Promise<any> {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.status = 'cancelled';
    await order.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'order.cancel',
      module: 'orders',
      targetId: orderId,
      targetType: 'Order',
      status: 'success',
      details: { reason },
    });

    return {
      success: true,
      message: 'Order cancelled successfully',
    };
  }

  async getOrderStats(): Promise<any> {
    const [total, completed, cancelled, pending, totalRevenue] = await Promise.all([
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({ status: 'completed' }),
      this.orderModel.countDocuments({ status: 'cancelled' }),
      this.orderModel.countDocuments({ status: { $in: ['pending', 'ongoing'] } }),
      this.orderModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        total,
        completed,
        cancelled,
        pending,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    };
  }
}
