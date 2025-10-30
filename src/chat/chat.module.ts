// src/chat/chat.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatController } from './controllers/chat.controller';
import { ChatGateway } from './gateways/chat.gateway';
import { ChatSessionService } from './services/chat-session.service';
import { ChatMessageService } from './services/chat-message.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { OrdersModule } from '../orders/orders.module'; // ✅ ADD
import { PaymentsModule } from '../payments/payments.module'; // ✅ ADD
import { AstrologersModule } from '../astrologers/astrologers.module'; // ✅ ADD

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    OrdersModule, // ✅ For order integration
    PaymentsModule, // ✅ For wallet operations
    AstrologersModule, // ✅ For astrologer details
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatSessionService, ChatMessageService],
  exports: [ChatSessionService, ChatMessageService],
})
export class ChatModule {}
