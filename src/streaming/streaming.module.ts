import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

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

// Schemas
import { StreamSession, StreamSessionSchema } from './schemas/stream-session.schema';
import { StreamViewer, StreamViewerSchema } from './schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionSchema } from './schemas/call-transaction.schema';

import { Admin, AdminSchema } from '../admin/schemas/admin.schema';

@Module({
  imports: [
    ConfigModule,
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
  ],
  exports: [
    StreamSessionService,
    StreamAgoraService,
    StreamAnalyticsService,
  ],
})
export class StreamingModule {}
