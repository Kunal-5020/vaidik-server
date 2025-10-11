import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { CallController } from './controllers/calls.controller';
import { CallGateway } from './gateways/calls.gateway';
import { CallSessionService } from './services/call-session.service';
import { AgoraService } from './services/agora.service';
import { CallBillingService } from './services/call-billing.service';
import { CallRecordingService } from './services/call-recording.service';
import { CallSession, CallSessionSchema } from './schemas/call-session.schema';
import { PaymentsModule } from '../payments/payments.module';
import { AstrologersModule } from '../astrologers/astrologers.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
    ]),
    PaymentsModule, // For wallet deduction
    AstrologersModule, // For earnings credit
  ],
  controllers: [CallController],
  providers: [
    CallGateway,
    CallSessionService,
    AgoraService,
    CallBillingService,
    CallRecordingService,
  ],
  exports: [CallSessionService, AgoraService, CallBillingService],
})
export class CallsModule {}
