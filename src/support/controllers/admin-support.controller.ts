import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// Guards & Decorators
import { AdminAuthGuard } from '../../admin/core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../admin/core/guards/permissions.guard';
import { RequirePermissions } from '../../admin/core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../admin/core/decorators/current-admin.decorator';
import { Permissions } from '../../admin/core/config/permissions.config';

// Schemas
import { SupportTicket, SupportTicketDocument } from '../schemas/support-ticket.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestDocument } from '../../payments/schemas/payout-request.schema';

// Services
import { RazorpayService } from '../../payments/services/razorpay.service';
import { WalletService } from '../../payments/services/wallet.service';
import { ZohoDeskService } from '../services/zoho-desk.service';

// DTOs
import { ProcessRefundDto } from '../dto/process-refund.dto';

@Controller('admin/support/tickets')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminSupportController {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(PayoutRequest.name) private payoutModel: Model<PayoutRequestDocument>,
    private razorpayService: RazorpayService,
    private walletService: WalletService,
    private zohoDeskService: ZohoDeskService,
  ) {}

  /**
   * GET /admin/support/tickets
   * Get all support tickets with filters
   */
  @Get()
  @RequirePermissions(Permissions.SUPPORT_TICKETS_VIEW)
  async getAllTickets(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('userType') userType?: string,
    @Query('search') search?: string,
  ) {
    const query: any = {};
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (userType) query.userModel = userType === 'user' ? 'User' : 'Astrologer';

    // Search by ticket number, subject, or user details
    if (search) {
      query.$or = [
        { ticketNumber: new RegExp(search, 'i') },
        { subject: new RegExp(search, 'i') },
        { 'userContext.name': new RegExp(search, 'i') },
        { 'userContext.email': new RegExp(search, 'i') },
      ];
    }

    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('ticketNumber subject category status userContext.name userContext.email zohoChatUrl createdAt refundProcessed payoutApproved requestedAmount userModel')
        .lean(),
      this.ticketModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        tickets,
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
   * GET /admin/support/tickets/stats
   * Get support dashboard statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.SUPPORT_STATS_VIEW)
  async getDashboardStats() {
    const [
      openTickets,
      inProgressTickets,
      refundPending,
      payoutPending,
      resolvedToday,
      totalTickets,
    ] = await Promise.all([
      this.ticketModel.countDocuments({ status: 'open' }),
      this.ticketModel.countDocuments({ status: 'in_progress' }),
      this.ticketModel.countDocuments({ 
        category: 'refund', 
        refundProcessed: false, 
        status: { $ne: 'closed' } 
      }),
      this.ticketModel.countDocuments({ 
        category: 'payout', 
        payoutApproved: false, 
        status: { $ne: 'closed' } 
      }),
      this.ticketModel.countDocuments({
        status: 'resolved',
        processedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.ticketModel.countDocuments(),
    ]);

    // Get category breakdown
    const categoryBreakdown = await this.ticketModel.aggregate([
      { $match: { status: { $in: ['open', 'in_progress'] } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return {
      success: true,
      data: {
        openTickets,
        inProgressTickets,
        refundPending,
        payoutPending,
        resolvedToday,
        totalTickets,
        categoryBreakdown,
      },
    };
  }

  /**
   * GET /admin/support/tickets/:ticketId
   * Get detailed ticket information
   */
  @Get(':ticketId')
  @RequirePermissions(Permissions.SUPPORT_TICKETS_VIEW)
  async getTicketDetails(@Param('ticketId') ticketId: string) {
    const ticket = await this.ticketModel.findById(ticketId).lean();

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Enrich with additional context
    let enhancedTicket: any = { ...ticket };

    // Add transaction details for refund tickets
    if (ticket.transactionId) {
      enhancedTicket.transaction = await this.transactionModel
        .findById(ticket.transactionId)
        .lean();
    }

    // Add payout details for payout tickets
    if (ticket.payoutId) {
      enhancedTicket.payout = await this.payoutModel
        .findOne({ payoutId: ticket.payoutId })
        .lean();
    }

    // Get user's previous tickets
    enhancedTicket.previousTickets = await this.ticketModel
      .find({
        userId: ticket.userId,
        _id: { $ne: ticket._id },
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('ticketNumber category status createdAt')
      .lean();

    return {
      success: true,
      data: enhancedTicket,
    };
  }

  /**
   * POST /admin/support/tickets/:ticketId/process-refund
   * Process refund for a ticket
   */
  /**
   * POST /admin/support/tickets/:ticketId/process-refund
   * Process refund for a ticket
   */
  @Post(':ticketId/process-refund')
  @RequirePermissions(Permissions.SUPPORT_REFUND_PROCESS)
  async processRefund(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) dto: ProcessRefundDto,
  ) {
    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.category !== 'refund') {
      throw new BadRequestException('This is not a refund ticket');
    }

    if (ticket.refundProcessed) {
      throw new BadRequestException('Refund already processed for this ticket');
    }

    let refundResult: any;

    try {
      if (dto.refundType === 'gateway') {
        // Process Razorpay refund
        const transaction = await this.transactionModel.findById(ticket.transactionId);

        if (!transaction || !transaction.paymentId) {
          throw new BadRequestException('Original payment transaction not found');
        }

        refundResult = await this.razorpayService.refundPayment(
          transaction.paymentId,
          dto.amount,
          dto.reason,
        );

        // ✅ FIX: Use refundToWallet instead of createRefundTransaction
        const refundTxn = await this.walletService.refundToWallet(
          ticket.userId.toString(),
          dto.amount,
          transaction.transactionId,
          `Payment Gateway Refund: ${dto.reason}`,
          undefined, // No session needed
        );

        refundResult.transactionId = refundTxn.transactionId;
      } else {
        // ✅ FIX: Use creditToWallet instead of addToWallet
        const creditTxn = await this.walletService.creditToWallet(
          ticket.userId.toString(),
          dto.amount,
          ticket._id.toString(),
          `Wallet Refund: ${dto.reason}`,
          'refund', // Type
          undefined, // No session needed
        );

        refundResult = {
          refundId: creditTxn.transactionId,
          transactionId: creditTxn.transactionId,
          amount: dto.amount,
          status: 'completed',
        };
      }

      // Update ticket
      ticket.refundProcessed = true;
      ticket.refundId = refundResult.refundId || refundResult.transactionId;
      ticket.refundAmount = dto.amount;
      ticket.status = 'resolved';
      ticket.processedBy = admin._id;
      ticket.processedAt = new Date();
      ticket.metadata = {
        ...ticket.metadata,
        refundType: dto.refundType,
        refundReason: dto.reason,
        processedByName: admin.name,
      };
      await ticket.save();

      // Update Zoho Desk ticket
      await this.zohoDeskService.updateTicket(ticket.zohoTicketId, {
        status: 'Closed',
        resolution: `Refund processed by ${admin.name}: ₹${dto.amount} via ${dto.refundType}. Refund ID: ${ticket.refundId}. Reason: ${dto.reason}`,
      });

      return {
        success: true,
        message: 'Refund processed successfully',
        data: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          refundId: ticket.refundId,
          amount: dto.amount,
          refundType: dto.refundType,
          processedAt: ticket.processedAt,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Refund processing failed: ${error.message}`);
    }
  }

  /**
   * POST /admin/support/tickets/:ticketId/approve-payout
   * Approve payout request for astrologer
   */
  @Post(':ticketId/approve-payout')
  @RequirePermissions(Permissions.SUPPORT_PAYOUT_APPROVE)
  async approvePayout(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body() body: { notes?: string },
  ) {
    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.category !== 'payout') {
      throw new BadRequestException('This is not a payout request ticket');
    }

    if (ticket.payoutApproved) {
      throw new BadRequestException('Payout already approved for this ticket');
    }

    try {
      // Update payout request status
      const payout = await this.payoutModel.findOne({ payoutId: ticket.payoutId });

      if (!payout) {
        throw new NotFoundException('Payout request not found');
      }

      payout.status = 'approved';
      payout.approvedBy = admin._id;
      payout.approvedAt = new Date();
      payout.adminNotes = body.notes || `Approved via support ticket by ${admin.name}`;
      await payout.save();

      // Update ticket
      ticket.payoutApproved = true;
      ticket.status = 'resolved';
      ticket.processedBy = admin._id;
      ticket.processedAt = new Date();
      ticket.metadata = {
        ...ticket.metadata,
        approvalNotes: body.notes,
        processedByName: admin.name,
      };
      await ticket.save();

      // Update Zoho Desk
      await this.zohoDeskService.updateTicket(ticket.zohoTicketId, {
        status: 'Closed',
        resolution: `Payout approved by ${admin.name}. Payout ID: ${ticket.payoutId}. Notes: ${body.notes || 'None'}`,
      });

      return {
        success: true,
        message: 'Payout approved successfully',
        data: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          payoutId: ticket.payoutId,
          payoutAmount: payout.amount,
          approvedAt: ticket.processedAt,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Payout approval failed: ${error.message}`);
    }
  }

  /**
   * POST /admin/support/tickets/:ticketId/reject-refund
   * Reject refund request
   */
  @Post(':ticketId/reject-refund')
  @RequirePermissions(Permissions.SUPPORT_REFUND_PROCESS)
  async rejectRefund(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.category !== 'refund') {
      throw new BadRequestException('This is not a refund ticket');
    }

    ticket.status = 'closed';
    ticket.processedBy = admin._id;
    ticket.processedAt = new Date();
    ticket.metadata = {
      ...ticket.metadata,
      rejectionReason: body.reason,
      rejectedBy: admin.name,
      rejectedAt: new Date(),
    };
    await ticket.save();

    // Update Zoho
    await this.zohoDeskService.updateTicket(ticket.zohoTicketId, {
      status: 'Closed',
      resolution: `Refund request rejected by ${admin.name}. Reason: ${body.reason}`,
    });

    return {
      success: true,
      message: 'Refund request rejected',
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        rejectionReason: body.reason,
      },
    };
  }

  /**
   * POST /admin/support/tickets/:ticketId/reject-payout
   * Reject payout request
   */
  @Post(':ticketId/reject-payout')
  @RequirePermissions(Permissions.SUPPORT_PAYOUT_APPROVE)
  async rejectPayout(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.category !== 'payout') {
      throw new BadRequestException('This is not a payout ticket');
    }

    // Update payout request
    const payout = await this.payoutModel.findOne({ payoutId: ticket.payoutId });
    
    if (payout) {
      payout.status = 'rejected';
      payout.rejectionReason = body.reason;
      payout.rejectedAt = new Date();
      await payout.save();
    }

    ticket.status = 'closed';
    ticket.processedBy = admin._id;
    ticket.processedAt = new Date();
    ticket.metadata = {
      ...ticket.metadata,
      rejectionReason: body.reason,
      rejectedBy: admin.name,
      rejectedAt: new Date(),
    };
    await ticket.save();

    // Update Zoho
    await this.zohoDeskService.updateTicket(ticket.zohoTicketId, {
      status: 'Closed',
      resolution: `Payout request rejected by ${admin.name}. Reason: ${body.reason}`,
    });

    return {
      success: true,
      message: 'Payout request rejected',
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        payoutId: ticket.payoutId,
        rejectionReason: body.reason,
      },
    };
  }

  /**
   * PATCH /admin/support/tickets/:ticketId/status
   * Update ticket status manually
   */
  @Post(':ticketId/status')
  @RequirePermissions(Permissions.SUPPORT_TICKETS_EDIT)
  async updateTicketStatus(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body() body: { status: string; notes?: string },
  ) {
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    
    if (!validStatuses.includes(body.status)) {
      throw new BadRequestException(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const oldStatus = ticket.status;
    ticket.status = body.status;
    
    if (body.status === 'resolved' || body.status === 'closed') {
      ticket.processedBy = admin._id;
      ticket.processedAt = new Date();
    }

    if (body.notes) {
      ticket.metadata = {
        ...ticket.metadata,
        statusChangeNotes: body.notes,
        changedBy: admin.name,
      };
    }

    await ticket.save();

    // Update Zoho
    const zohoStatusMap: Record<string, string> = {
      'open': 'Open',
      'in_progress': 'In Progress',
      'resolved': 'Closed',
      'closed': 'Closed',
    };

    await this.zohoDeskService.updateTicket(ticket.zohoTicketId, {
      status: zohoStatusMap[body.status],
    });

    return {
      success: true,
      message: 'Ticket status updated successfully',
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        oldStatus,
        newStatus: body.status,
      },
    };
  }

  /**
   * POST /admin/support/tickets/:ticketId/add-note
   * Add internal note to ticket
   */
  @Post(':ticketId/add-note')
  @RequirePermissions(Permissions.SUPPORT_TICKETS_EDIT)
  async addInternalNote(
    @Param('ticketId') ticketId: string,
    @CurrentAdmin() admin: any,
    @Body() body: { note: string },
  ) {
    if (!body.note) {
      throw new BadRequestException('Note content is required');
    }

    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Add to Zoho as internal comment
    await this.zohoDeskService.addComment(ticket.zohoTicketId, body.note, false);

    // Store in metadata
    const notes = ticket.metadata.internalNotes || [];
    notes.push({
      note: body.note,
      addedBy: admin.name,
      addedAt: new Date(),
    });

    ticket.metadata = {
      ...ticket.metadata,
      internalNotes: notes,
    };
    await ticket.save();

    return {
      success: true,
      message: 'Internal note added successfully',
      data: {
        ticketId: ticket._id,
        note: body.note,
      },
    };
  }
}
