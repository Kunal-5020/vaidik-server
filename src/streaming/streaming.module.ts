import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PaymentsModule } from '../payments/payments.module';

// Controllers
import { StreamController } from './controllers/stream.controller';
import { AstrologerStreamController } from './controllers/astrologer-stream.controller';
import { AdminStreamController } from './controllers/admin-stream.controller'; // ✅ Added

// Gateways
import { StreamGateway } from './gateways/streaming.gateway';

// Services
import { StreamSessionService } from './services/stream-session.service';
import { StreamAgoraService } from './services/stream-agora.service';
import { StreamAnalyticsService } from './services/stream-analytics.service';
import { StreamRecordingService } from './services/stream-recording.service';

// Schemas
import { StreamSession, StreamSessionSchema } from './schemas/stream-session.schema';
import { StreamViewer, StreamViewerSchema } from './schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionSchema } from './schemas/call-transaction.schema';
import { Admin, AdminSchema } from '../admin/core/schemas/admin.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema'; // ✅ ADD THIS
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    PaymentsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    PassportModule,
    MongooseModule.forFeature([
      { name: StreamSession.name, schema: StreamSessionSchema },
      { name: StreamViewer.name, schema: StreamViewerSchema },
      { name: CallTransaction.name, schema: CallTransactionSchema },
      { name: Admin.name, schema: AdminSchema }, 
      { name: Astrologer.name, schema: AstrologerSchema }, // ✅ ADD THIS
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    StreamController,
    AstrologerStreamController,
    AdminStreamController, // ✅ Added
  ],
  providers: [
    StreamGateway,
    StreamSessionService,
    StreamAgoraService,
    StreamAnalyticsService,
    StreamGateway,
    StreamRecordingService,
  ],
  exports: [
    StreamSessionService,
    StreamAgoraService,
    StreamAnalyticsService,
    StreamGateway,
  ],
})
export class StreamingModule {}
