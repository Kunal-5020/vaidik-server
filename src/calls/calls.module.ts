// src/calls/calls.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallController } from './controllers/calls.controller';
import { CallGateway } from './gateways/calls.gateway';
import { CallSessionService } from './services/call-session.service';
import { CallRecordingService } from './services/call-recording.service';
import { AgoraService } from './services/agora.service'; // ✅ ADD
import { CallBillingService } from './services/call-billing.service'; // ✅ ADD
import { CallSession, CallSessionSchema } from './schemas/call-session.schema';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AstrologersModule } from '../astrologers/astrologers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';
import { EarningsService } from '../astrologers/services/earnings.service'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
    OrdersModule,
    PaymentsModule,
    AstrologersModule,
    NotificationsModule,
    ChatModule, // ✅ ADD
  ],
  controllers: [CallController],
  providers: [
    CallGateway,
    CallSessionService,
    CallRecordingService,
    AgoraService, // ✅ ADD
    CallBillingService, // ✅ ADD
    EarningsService,
  ],
  exports: [CallSessionService, CallRecordingService, AgoraService, CallBillingService],
})
export class CallsModule {}
