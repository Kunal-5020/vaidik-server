import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StreamingService } from './streaming.service';
import { StreamingController } from './streaming.controller';
import { StreamingGateway } from './streaming.gateway';
import { StreamManagementService } from './services/stream-management.service';
import { StreamAnalyticsService } from './services/stream-analytics.service';

// Schemas
import { LiveStream, LiveStreamSchema } from './schemas/live-stream.schema';
import { StreamViewer, StreamViewerSchema } from './schemas/stream-viewer.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';

// Import other modules
import { CallsModule } from '../calls/calls.module'; // For Agora service
import { FirebaseModule } from '../firebase/firebase.module'; // For notifications

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LiveStream.name, schema: LiveStreamSchema },
      { name: StreamViewer.name, schema: StreamViewerSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
    ]),
    CallsModule, // For AgoraService
    FirebaseModule, // For push notifications
  ],
  controllers: [StreamingController],
  providers: [
    StreamingService,
    StreamingGateway,
    StreamManagementService,
    StreamAnalyticsService,
  ],
  exports: [
    StreamingService,
    StreamManagementService,
  ],
})
export class StreamingModule {}
