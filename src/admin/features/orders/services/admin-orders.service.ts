// src/admin/features/orders/services/admin-orders.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { CallSession, CallSessionDocument } from '../../../../calls/schemas/call-session.schema';
import { ChatSession, ChatSessionDocument } from '../../../../chat/schemas/chat-session.schema';
import { WalletService } from '../../../../payments/services/wallet.service';
import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { NotificationService } from '../../../../notifications/services/notification.service';
import { OrderFilter } from '../interfaces/order-filter.interface';
import { ProcessRefundDto } from '../dto/process-refund.dto';
import { RefundOrderDto } from '../dto/refund-order.dto';

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSessionDocument>,
    private walletService: WalletService,
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
  ) {}

  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch (error) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  /**
   * Get all orders with filters
   */
  async getAllOrders(
    page: number = 1,
    limit: number = 50,
    filters?: OrderFilter
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { isDeleted: false };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;
    if (filters?.userId) query.userId = this.toObjectId(filters.userId);
    if (filters?.astrologerId) query.astrologerId = this.toObjectId(filters.astrologerId);

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('userId', 'name phoneNumber profileImage wallet')
        .populate('astrologerId', 'name phoneNumber profilePicture')
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
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        },
      },
    };
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ orderId, isDeleted: false })
      .populate('userId', 'name phoneNumber profileImage wallet')
      .populate('astrologerId', 'name phoneNumber profilePicture specializations experienceYears')
      .lean();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      success: true,
      data: order,
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStats(): Promise<any> {
    const [
      total,
      completed,
      cancelled,
      pending,
      active,
      refundRequested,
      totalRevenue,
      ordersByType,
      todayOrders
    ] = await Promise.all([
      this.orderModel.countDocuments({ isDeleted: false }),
      this.orderModel.countDocuments({ status: 'completed', isDeleted: false }),
      this.orderModel.countDocuments({ status: 'cancelled', isDeleted: false }),
      this.orderModel.countDocuments({ status: 'pending', isDeleted: false }),
      this.orderModel.countDocuments({ status: 'active', isDeleted: false }),
      this.orderModel.countDocuments({ status: 'refund_requested', isDeleted: false }),
      this.orderModel.aggregate([
        { $match: { status: 'completed', isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      this.orderModel.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        isDeleted: false
      })
    ]);

    return {
      success: true,
      data: {
        total,
        completed,
        cancelled,
        pending,
        active,
        refundRequested,
        todayOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        ordersByType: ordersByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
    };
  }

  /**
   * Get revenue statistics
   */
  async getRevenueStats(startDate?: string, endDate?: string): Promise<any> {
    const matchQuery: any = {
      status: 'completed',
      isDeleted: false
    };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const [revenueData, revenueByType] = await Promise.all([
      this.orderModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            averageOrderValue: { $avg: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        }
      ]),
      this.orderModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$type',
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
            avgValue: { $avg: '$totalAmount' }
          }
        }
      ])
    ]);

    return {
      success: true,
      data: {
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        averageOrderValue: revenueData[0]?.averageOrderValue || 0,
        orderCount: revenueData[0]?.orderCount || 0,
        revenueByType
      }
    };
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, adminId: string, reason: string): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!['pending', 'waiting', 'waiting_in_queue', 'active'].includes(order.status)) {
      throw new BadRequestException('Only pending, waiting, or active orders can be cancelled');
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = 'admin';
    order.cancelledAt = new Date();

    // Release hold if payment was on hold
    if (order.payment?.status === 'hold' && order.payment?.heldAmount > 0) {
      try {
        const refundAmount = order.payment.heldAmount;
        
        await this.walletService.refundToWallet(
          order.userId.toString(),
          refundAmount,
          orderId,
          `Admin cancelled order: ${reason}`,
          undefined,
        );

        order.payment.status = 'refunded';
        order.payment.refundedAmount = order.payment.heldAmount;
        order.payment.refundedAt = new Date();
      } catch (error: any) {
        this.logger.error(`Failed to release hold for cancelled order ${orderId}: ${error.message}`);
      }
    }

    await order.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'order.cancel',
      module: 'orders',
      targetId: orderId,
      targetType: 'Order',
      status: 'success',
      details: { 
        reason, 
        refunded: order.payment?.status === 'refunded' 
      },
    });

    // Notify user
    await this.notificationService.sendNotification({
      recipientId: order.userId.toString(),
      recipientModel: 'User',
      type: 'order_cancelled',
      title: 'Order Cancelled',
      message: `Your order ${orderId} has been cancelled by admin. ${
        order.payment?.status === 'refunded' ? 'Hold amount has been released.' : ''
      }`,
      priority: 'high',
    });

    this.logger.log(`Order cancelled by admin: ${orderId} | Admin: ${adminId}`);

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: {
        orderId: order.orderId,
        refunded: order.payment?.status === 'refunded',
        refundedAmount: order.payment?.refundedAmount
      }
    };
  }

  /**
   * Get pending refund requests
   */
  async getPendingRefundRequests(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.orderModel
        .find({
          'refundRequest.status': 'pending',
          status: 'refund_requested',
          isDeleted: false
        })
        .populate('userId', 'name phoneNumber profileImage')
        .populate('astrologerId', 'name phoneNumber')
        .populate('refundRequest.requestedBy', 'name phoneNumber')
        .sort({ 'refundRequest.requestedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments({
        'refundRequest.status': 'pending',
        status: 'refund_requested',
        isDeleted: false
      })
    ]);

    return {
      success: true,
      data: {
        refundRequests: requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  /**
   * Get all refund requests
   */
  async getAllRefundRequests(
    page: number = 1,
    limit: number = 20,
    status?: string
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {
      'refundRequest': { $exists: true },
      isDeleted: false
    };

    if (status) {
      query['refundRequest.status'] = status;
    }

    const [requests, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('userId', 'name phoneNumber')
        .populate('astrologerId', 'name phoneNumber')
        .populate('refundRequest.requestedBy', 'name phoneNumber')
        .populate('refundRequest.processedBy', 'name phoneNumber')
        .sort({ 'refundRequest.requestedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        refundRequests: requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  /**
   * Get refund statistics
   */
  async getRefundStats(): Promise<any> {
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      totalRefunded
    ] = await Promise.all([
      this.orderModel.countDocuments({
        'refundRequest': { $exists: true },
        isDeleted: false
      }),
      this.orderModel.countDocuments({
        'refundRequest.status': 'pending',
        isDeleted: false
      }),
      this.orderModel.countDocuments({
        'refundRequest.status': 'approved',
        isDeleted: false
      }),
      this.orderModel.countDocuments({
        'refundRequest.status': 'rejected',
        isDeleted: false
      }),
      this.orderModel.aggregate([
        {
          $match: {
            status: 'refunded',
            'refundRequest.refundAmount': { $exists: true },
            isDeleted: false
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$refundRequest.refundAmount' }
          }
        }
      ])
    ]);

    return {
      success: true,
      data: {
        totalRequests,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        totalRefunded: totalRefunded[0]?.total || 0
      }
    };
  }

  /**
   * Process refund request
   */
  async processRefundRequest(
    orderId: string,
    adminId: string,
    processDto: ProcessRefundDto,
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      'refundRequest.status': 'pending',
      status: 'refund_requested',
      isDeleted: false
    });

    if (!order || !order.refundRequest) {
      throw new NotFoundException('Refund request not found or already processed');
    }

    if (processDto.action === 'approve') {
      // Calculate refund amount
      const refundPercentage = processDto.refundPercentage || 100;
      const refundAmount = (order.totalAmount * refundPercentage) / 100;

      // Update refund request
      order.refundRequest.status = 'approved';
      order.refundRequest.processedAt = new Date();
      order.refundRequest.processedBy = this.toObjectId(adminId);
      order.refundRequest.adminNotes = processDto.adminNotes;
      order.refundRequest.refundAmount = refundAmount;
      order.refundRequest.refundPercentage = refundPercentage;

      order.status = 'refund_approved';

      // Process actual refund
      try {
        const refundTxn = await this.walletService.creditToWallet(
          order.userId.toString(),
          refundAmount,
          orderId,
          `Refund approved for order ${orderId} - ${refundPercentage}% refund`
        );

        order.payment = order.payment || {};
        order.payment.status = 'refunded';
        order.payment.refundedAmount = refundAmount;
        order.payment.refundedAt = new Date();
        order.payment.refundTransactionId = refundTxn.transactionId;

        order.status = 'refunded';

        await order.save();

        // Log activity
        await this.activityLogService.log({
          adminId,
          action: 'refund.approve',
          module: 'orders',
          targetId: orderId,
          targetType: 'Order',
          status: 'success',
          details: {
            refundAmount,
            refundPercentage,
            notes: processDto.adminNotes
          },
        });

        // Notify user
        await this.notificationService.sendNotification({
          recipientId: order.userId.toString(),
          recipientModel: 'User',
          type: 'payment_success',
          title: 'Refund Approved',
          message: `Your refund request for order ${orderId} has been approved. ₹${refundAmount} has been credited to your wallet.`,
          priority: 'high',
        });

        this.logger.log(`Refund approved: ${orderId} | Amount: ₹${refundAmount} | Admin: ${adminId}`);

        return {
          success: true,
          message: 'Refund approved and processed successfully',
          data: {
            orderId: order.orderId,
            refundAmount,
            refundPercentage,
            refundTransactionId: order.payment.refundTransactionId
          }
        };
      } catch (error: any) {
        order.refundRequest.status = 'pending';
        order.status = 'refund_requested';
        await order.save();

        this.logger.error(`Refund processing failed for ${orderId}: ${error.message}`);
        throw new BadRequestException(`Refund processing failed: ${error.message}`);
      }
    } else {
      // Reject refund
      order.refundRequest.status = 'rejected';
      order.refundRequest.processedAt = new Date();
      order.refundRequest.processedBy = this.toObjectId(adminId);
      order.refundRequest.adminNotes = processDto.adminNotes;
      order.refundRequest.rejectionReason = processDto.rejectionReason;

      order.status = 'refund_rejected';

      await order.save();

      // Log activity
      await this.activityLogService.log({
        adminId,
        action: 'refund.reject',
        module: 'orders',
        targetId: orderId,
        targetType: 'Order',
        status: 'success',
        details: {
          reason: processDto.rejectionReason,
          notes: processDto.adminNotes
        },
      });

      // Notify user
      await this.notificationService.sendNotification({
        recipientId: order.userId.toString(),
        recipientModel: 'User',
        type: 'general',
        title: 'Refund Request Rejected',
        message: `Your refund request for order ${orderId} has been rejected. ${processDto.rejectionReason || ''}`,
        priority: 'medium',
      });

      this.logger.log(`Refund rejected: ${orderId} | Reason: ${processDto.rejectionReason} | Admin: ${adminId}`);

      return {
        success: true,
        message: 'Refund request rejected',
        data: {
          orderId: order.orderId,
          rejectionReason: processDto.rejectionReason
        }
      };
    }
  }

  /**
   * Direct refund (legacy support)
   */
  async refundOrderDirect(
    orderId: string,
    adminId: string,
    refundDto: RefundOrderDto,
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const refundAmount = refundDto.amount || order.totalAmount;

    // Process refund
    const refundTxn = await this.walletService.creditToWallet(
      order.userId.toString(),
      refundAmount,
      orderId,
      `Direct refund by admin: ${refundDto.reason || 'No reason provided'}`
    );

    order.status = 'refunded';
    order.payment = order.payment || {};
    order.payment.status = 'refunded';
    order.payment.refundedAmount = refundAmount;
    order.payment.refundedAt = new Date();
    order.payment.refundTransactionId = refundTxn.transactionId;

    await order.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'order.refund.direct',
      module: 'orders',
      targetId: orderId,
      targetType: 'Order',
      status: 'success',
      details: {
        amount: refundAmount,
        reason: refundDto.reason,
      },
    });

    // Notify user
    await this.notificationService.sendNotification({
      recipientId: order.userId.toString(),
      recipientModel: 'User',
      type: 'payment_success',
      title: 'Refund Processed',
      message: `Your refund of ₹${refundAmount} for order ${orderId} has been processed.`,
      priority: 'high',
    });

    return {
      success: true,
      message: 'Refund processed successfully',
      data: {
        orderId: order.orderId,
        refundAmount,
        refundTransactionId: order.payment.refundTransactionId
      }
    };
  }
async getAllCalls(query: any) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (status) filter.status = status;

    const [calls, total] = await Promise.all([
      this.callSessionModel
        .find(filter)
        .populate('userId', 'name phoneNumber profileImage')
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.callSessionModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: {
        orders: calls, // Maintaining 'orders' key for frontend compatibility
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    };
  }

  async getAllChats(query: any) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (status) filter.status = status;

    const [chats, total] = await Promise.all([
      this.chatSessionModel
        .find(filter)
        .populate('userId', 'name phoneNumber profileImage')
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.chatSessionModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: {
        orders: chats,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    };
  }
}
