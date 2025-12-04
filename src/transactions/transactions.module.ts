// src/transactions/transactions.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionService } from './services/transaction.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionsModule {}
