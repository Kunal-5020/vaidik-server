// src/bank-accounts/services/bank-account.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccount, BankAccountDocument } from '../schemas/bank-account.schema';
import { EncryptionService } from './encryption.service';
import { AddBankAccountDto } from '../dto/add-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectModel(BankAccount.name)
    private bankAccountModel: Model<BankAccountDocument>,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Add new bank account
   */
  async addBankAccount(
    astrologerId: string,
    addDto: AddBankAccountDto,
  ): Promise<any> {
    // Check if account already exists
    const existingAccount = await this.bankAccountModel.findOne({
      astrologerId,
      accountNumber: this.encryptionService.encrypt(addDto.accountNumber),
      isActive: true,
    });

    if (existingAccount) {
      throw new ConflictException('This bank account is already added');
    }

    // Get bank name from IFSC if not provided
    if (!addDto.bankName) {
      addDto.bankName = await this.getBankNameFromIFSC(addDto.ifscCode);
    }

    // Check if this is the first account (make it primary)
    const accountCount = await this.bankAccountModel.countDocuments({
      astrologerId,
      isActive: true,
    });

    const isPrimary = accountCount === 0;

    // Encrypt account number
    const encryptedAccountNumber = this.encryptionService.encrypt(
      addDto.accountNumber,
    );

    const bankAccount = new this.bankAccountModel({
      astrologerId,
      accountHolderName: addDto.accountHolderName,
      accountNumber: encryptedAccountNumber,
      ifscCode: addDto.ifscCode.toUpperCase(),
      bankName: addDto.bankName,
      branchName: addDto.branchName,
      upiId: addDto.upiId,
      isPrimary,
      verificationStatus: 'pending',
    });

    await bankAccount.save();

    return {
      success: true,
      message: 'Bank account added successfully',
      data: this.sanitizeBankAccount(bankAccount),
    };
  }

  /**
   * Get all bank accounts for astrologer
   */
  async getBankAccounts(astrologerId: string): Promise<any> {
    const accounts = await this.bankAccountModel
      .find({ astrologerId, isActive: true })
      .sort({ isPrimary: -1, createdAt: -1 })
      .lean();

    const sanitizedAccounts = accounts.map(account =>
      this.sanitizeBankAccount(account),
    );

    return {
      success: true,
      data: {
        accounts: sanitizedAccounts,
        total: sanitizedAccounts.length,
      },
    };
  }

  /**
   * Get bank account by ID
   */
  async getBankAccountById(
    accountId: string,
    astrologerId: string,
  ): Promise<any> {
    const account = await this.bankAccountModel.findOne({
      _id: accountId,
      astrologerId,
      isActive: true,
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    return {
      success: true,
      data: this.sanitizeBankAccount(account),
    };
  }

  /**
   * Update bank account
   */
  async updateBankAccount(
    accountId: string,
    astrologerId: string,
    updateDto: UpdateBankAccountDto,
  ): Promise<any> {
    const account = await this.bankAccountModel.findOne({
      _id: accountId,
      astrologerId,
      isActive: true,
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Update only allowed fields
    if (updateDto.accountHolderName) {
      account.accountHolderName = updateDto.accountHolderName;
    }
    if (updateDto.bankName) {
      account.bankName = updateDto.bankName;
    }
    if (updateDto.branchName) {
      account.branchName = updateDto.branchName;
    }
    if (updateDto.upiId !== undefined) {
      account.upiId = updateDto.upiId;
    }

    account.updatedAt = new Date();
    await account.save();

    return {
      success: true,
      message: 'Bank account updated successfully',
      data: this.sanitizeBankAccount(account),
    };
  }

  /**
   * Set primary account
   */
  async setPrimaryAccount(
    accountId: string,
    astrologerId: string,
  ): Promise<any> {
    // Remove primary flag from all accounts
    await this.bankAccountModel.updateMany(
      { astrologerId, isPrimary: true },
      { $set: { isPrimary: false } },
    );

    // Set new primary
    const account = await this.bankAccountModel.findOneAndUpdate(
      { _id: accountId, astrologerId, isActive: true },
      { $set: { isPrimary: true } },
      { new: true },
    );

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    return {
      success: true,
      message: 'Primary account updated',
      data: this.sanitizeBankAccount(account),
    };
  }

  /**
   * Delete bank account (soft delete)
   */
  async deleteBankAccount(
    accountId: string,
    astrologerId: string,
  ): Promise<any> {
    const account = await this.bankAccountModel.findOne({
      _id: accountId,
      astrologerId,
      isActive: true,
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Don't allow deleting primary account if other accounts exist
    if (account.isPrimary) {
      const otherAccounts = await this.bankAccountModel.countDocuments({
        astrologerId,
        isActive: true,
        _id: { $ne: accountId },
      });

      if (otherAccounts > 0) {
        throw new BadRequestException(
          'Cannot delete primary account. Set another account as primary first.',
        );
      }
    }

    account.isActive = false;
    account.updatedAt = new Date();
    await account.save();

    return {
      success: true,
      message: 'Bank account deleted successfully',
    };
  }

  /**
   * Sanitize bank account (mask sensitive data)
   */
  private sanitizeBankAccount(account: any): any {
    const decryptedAccountNumber = this.encryptionService.decrypt(
      account.accountNumber,
    );

    return {
      _id: account._id,
      accountHolderName: account.accountHolderName,
      accountNumber: decryptedAccountNumber, // Full number for withdrawal
      accountNumberMasked: this.encryptionService.maskAccountNumber(
        decryptedAccountNumber,
      ),
      last4Digits: this.encryptionService.getLast4Digits(decryptedAccountNumber),
      ifscCode: account.ifscCode,
      bankName: account.bankName,
      branchName: account.branchName,
      upiId: account.upiId,
      isPrimary: account.isPrimary,
      isVerified: account.isVerified,
      verificationStatus: account.verificationStatus,
      lastUsedAt: account.lastUsedAt,
      createdAt: account.createdAt,
    };
  }

  /**
   * Get bank name from IFSC code
   */
  private async getBankNameFromIFSC(ifscCode: string): Promise<string> {
    // Map of bank codes to names
    const bankCodes: Record<string, string> = {
      SBIN: 'State Bank of India',
      HDFC: 'HDFC Bank',
      ICIC: 'ICICI Bank',
      AXIS: 'Axis Bank',
      PUNB: 'Punjab National Bank',
      UBIN: 'Union Bank of India',
      IDIB: 'Indian Bank',
      BARB: 'Bank of Baroda',
      CNRB: 'Canara Bank',
      IOBA: 'Indian Overseas Bank',
      UTIB: 'Axis Bank',
      KKBK: 'Kotak Mahindra Bank',
      YESB: 'Yes Bank',
      INDB: 'IndusInd Bank',
      FDRL: 'Federal Bank',
    };

    const bankCode = ifscCode.substring(0, 4);
    return bankCodes[bankCode] || 'Unknown Bank';
  }
}
