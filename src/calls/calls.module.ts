import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { CallsGateway } from './calls.gateway';
import { AgoraService } from './services/agora.service';
import { CallBillingService } from './services/call-billing.service';
import { CallRecordingService } from './services/call-recording.service';

// Schemas
import { CallSession, CallSessionSchema } from './schemas/call-session.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';

// Firebase services for notifications
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
    FirebaseModule, // For push notifications
  ],
  controllers: [CallsController],
  providers: [
    CallsService,
    CallsGateway,
    AgoraService,
    CallBillingService,
    CallRecordingService,
  ],
  exports: [
    CallsService,
    AgoraService,
  ],
})
export class CallsModule {}
