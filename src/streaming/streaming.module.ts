import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { StreamController } from './controllers/stream.controller';
import { AstrologerStreamController } from './controllers/astrologer-stream.controller';
import { StreamGateway } from './gateways/streaming.gateway';
import { StreamSessionService } from './services/stream-session.service';
import { StreamAgoraService } from './services/stream-agora.service';
import { StreamAnalyticsService } from './services/stream-analytics.service';
import { StreamSession, StreamSessionSchema } from './schemas/stream-session.schema';
import { StreamViewer, StreamViewerSchema } from './schemas/stream-viewer.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: StreamSession.name, schema: StreamSessionSchema },
      { name: StreamViewer.name, schema: StreamViewerSchema },
    ]),
  ],
  controllers: [StreamController, AstrologerStreamController],
  providers: [
    StreamGateway,
    StreamSessionService,
    StreamAgoraService,
    StreamAnalyticsService,
  ],
  exports: [StreamSessionService, StreamAgoraService],
})
export class StreamingModule {}
