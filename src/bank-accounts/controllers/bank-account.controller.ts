// src/bank-accounts/controllers/bank-account.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BankAccountService } from '../services/bank-account.service';
import { AddBankAccountDto } from '../dto/add-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/bank-accounts')
@UseGuards(JwtAuthGuard)
export class BankAccountController {
  constructor(private bankAccountService: BankAccountService) {}

  /**
   * Add bank account
   * POST /astrologer/bank-accounts
   */
  @Post()
  async addBankAccount(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) addDto: AddBankAccountDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.addBankAccount(astrologerId, addDto);
  }

  /**
   * Get all bank accounts
   * GET /astrologer/bank-accounts
   */
  @Get()
  async getBankAccounts(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.getBankAccounts(astrologerId);
  }

  /**
   * Get bank account by ID
   * GET /astrologer/bank-accounts/:accountId
   */
  @Get(':accountId')
  async getBankAccountById(
    @Param('accountId') accountId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.getBankAccountById(accountId, astrologerId);
  }

  /**
   * Update bank account
   * PATCH /astrologer/bank-accounts/:accountId
   */
  @Patch(':accountId')
  async updateBankAccount(
    @Param('accountId') accountId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateBankAccountDto,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.updateBankAccount(
      accountId,
      astrologerId,
      updateDto,
    );
  }

  /**
   * Set primary account
   * PATCH /astrologer/bank-accounts/:accountId/set-primary
   */
  @Patch(':accountId/set-primary')
  async setPrimaryAccount(
    @Param('accountId') accountId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.setPrimaryAccount(accountId, astrologerId);
  }

  /**
   * Delete bank account
   * DELETE /astrologer/bank-accounts/:accountId
   */
  @Delete(':accountId')
  async deleteBankAccount(
    @Param('accountId') accountId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.bankAccountService.deleteBankAccount(accountId, astrologerId);
  }
}
