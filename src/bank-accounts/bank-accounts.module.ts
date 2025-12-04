// src/bank-accounts/bank-accounts.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccount, BankAccountSchema } from './schemas/bank-account.schema';
import { BankAccountController } from './controllers/bank-account.controller';
import { BankAccountService } from './services/bank-account.service';
import { EncryptionService } from './services/encryption.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankAccount.name, schema: BankAccountSchema },
    ]),
  ],
  controllers: [BankAccountController],
  providers: [BankAccountService, EncryptionService],
  exports: [BankAccountService],
})
export class BankAccountsModule {}
