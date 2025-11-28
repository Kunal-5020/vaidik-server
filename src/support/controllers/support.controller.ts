import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SupportTicket, SupportTicketDocument } from '../schemas/support-ticket.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestDocument } from '../../payments/schemas/payout-request.schema';
import { ZohoDeskService } from '../services/zoho-desk.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(PayoutRequest.name) private payoutModel: Model<PayoutRequestDocument>,
    private zohoDeskService: ZohoDeskService,
    private configService: ConfigService,
  ) {}

  // ===== GET CATEGORIES =====
  @Get('categories')
  getCategories(@Req() req: AuthenticatedRequest) {
    const isAstrologer = !!req.user.astrologerId;
    const categories = {
      user: [
        { id: 'refund', text: 'I am facing issues while Recharging on Astrotalk', icon: '💰' },
        { id: 'session', text: 'I need help with my Free session', icon: '🎁' },
        { id: 'language', text: 'Change the language', icon: '🌐' },
        { id: 'guidance', text: 'I need guidance in using the Astrotalk app', icon: '📱' },
        { id: 'privacy', text: 'I have my Privacy related doubts', icon: '🔒' },
      ],
      astrologer: [
        { id: 'payout', text: 'Payout Request Help', icon: '💸' },
        { id: 'penalty', text: 'Penalty Issue / Removal Request', icon: '⚠️' },
        { id: 'general', text: 'General Query', icon: '💬' },
      ],
    };
    return {
      success: true,
      data: isAstrologer ? categories.astrologer : categories.user,
    };
  }

  // ===== CREATE TICKET =====
  @Post('tickets')
  async createTicket(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: CreateTicketDto,
  ) {
    const userId = req.user._id;
    const astrologerId = req.user.astrologerId;
    const isAstrologer = !!astrologerId;

    // Get user/astrologer details (phone only, no email required)
    let userContext: any;
    let entityId: string;
    let userModel: string;

    if (isAstrologer) {
      const astrologer = await this.astrologerModel.findById(astrologerId).lean();
      if (!astrologer) throw new BadRequestException('Astrologer not found');
      userContext = {
        name: astrologer.name,
        phone: astrologer.phoneNumber,
        walletBalance: astrologer.earnings?.withdrawableAmount || 0,
        totalSpent: astrologer.earnings?.totalEarned || 0,
      };
      entityId = astrologerId;
      userModel = 'Astrologer';
    } else {
      const user = await this.userModel.findById(userId).lean();
      if (!user) throw new BadRequestException('User not found');
      userContext = {
        name: user.name,
        phone: user.phoneNumber,
        walletBalance: user.wallet?.balance || 0,
        totalSpent: user.wallet?.totalSpent || 0,
      };
      entityId = userId;
      userModel = 'User';
    }

    // Construct description
    let description = `${dto.subject}\n\n`;
    description += `--- ${userModel.toUpperCase()} CONTEXT ---\n`;
    description += `Name: ${userContext.name}\n`;
    description += `Phone: ${userContext.phone}\n`;
    description += `Wallet Balance: ₹${userContext.walletBalance}\n`;
    description += `Total Spent/Earned: ₹${userContext.totalSpent}\n`;

    if (dto.category === 'refund' && dto.transactionId) {
      const transaction = await this.transactionModel.findOne({ transactionId: dto.transactionId }).lean();
      if (transaction) {
        description += `\n--- TRANSACTION DETAILS ---\n`;
        description += `Transaction ID: ${transaction.transactionId}\n`;
        description += `Amount: ₹${transaction.amount}\n`;
        description += `Status: ${transaction.status}\n`;
        description += `Payment ID: ${transaction.paymentId || 'N/A'}\n`;
        description += `Date: ${transaction.createdAt}\n`;
      }
    }

    if (dto.category === 'payout' && dto.payoutId) {
      const payout = await this.payoutModel.findOne({ payoutId: dto.payoutId }).lean();
      if (payout) {
        description += `\n--- PAYOUT DETAILS ---\n`;
        description += `Payout ID: ${payout.payoutId}\n`;
        description += `Amount: ₹${payout.amount}\n`;
        description += `Status: ${payout.status}\n`;
        description += `Bank Account: ${payout.bankDetails.accountNumber}\n`;
        description += `IFSC: ${payout.bankDetails.ifscCode}\n`;
      }
    }

    const priority = ['refund', 'payout', 'penalty'].includes(dto.category) ? 'high' : 'medium';
    const departmentId = this.configService.get<string>('ZOHO_DEPARTMENT_ID');
    if (!departmentId) throw new BadRequestException('Zoho Department ID not configured');

    // --- KEY PART: Create ticket with ensured Desk contact by PHONE ---
    const zohoTicket = await this.zohoDeskService.createTicketWithContact(
      userContext.name,
      userContext.phone,
      dto.subject,
      description,
      departmentId,
      {
        category: dto.category,
        priority,
        customFields: {
          userId: entityId,
          userType: userModel,
          transactionId: dto.transactionId || null,
          payoutId: dto.payoutId || null,
        },
      }
    );

    // Store in our database
    const ticket = await this.ticketModel.create({
      zohoTicketId: zohoTicket.id,
      ticketNumber: zohoTicket.ticketNumber,
      userId: entityId,
      userModel,
      category: dto.category,
      subject: dto.subject,
      status: 'open',
      zohoChatUrl: `${this.configService.get<string>('ZOHO_DESK_URL')}/agent/tickets/${zohoTicket.id}`,
      transactionId: dto.transactionId || null,
      payoutId: dto.payoutId || null,
      requestedAmount: dto.requestedAmount || null,
      userContext,
      metadata: dto.metadata || {},
    });

    return {
      success: true,
      message: 'Support ticket created successfully',
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        zohoTicketId: ticket.zohoTicketId,
        chatUrl: `${this.configService.get<string>('ZOHO_DESK_WIDGET_URL')}?ticket=${zohoTicket.id}`,
      },
    };
  }

  // ===== GET USER TICKETS =====
  @Get('tickets')
  async getMyTickets(@Req() req: AuthenticatedRequest) {
    const entityId = req.user.astrologerId || req.user._id;
    const tickets = await this.ticketModel
      .find({ userId: entityId })
      .sort({ createdAt: -1 })
      .select('ticketNumber subject category status createdAt zohoChatUrl refundProcessed payoutApproved')
      .lean();

    return {
      success: true,
      data: { tickets },
    };
  }
}
