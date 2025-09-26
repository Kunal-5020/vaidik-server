import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatSessionService } from './services/chat-session.service';
import { MessageService } from './services/message.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { Message, MessageSchema } from './schemas/message.schema';

// Import Firebase services directly
import { FirebaseAdminConfig } from '../firebase/firebase-admin.config';
import { FcmService } from '../firebase/fcm.service';
import { NotificationTemplatesService } from '../firebase/notification-templates.service';
import { DeviceTokenService } from '../users/services/device-token.service';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema }, // Needed for DeviceTokenService
    ]),
  ],
  providers: [
    ChatGateway, 
    ChatSessionService, 
    MessageService,
    // Add Firebase services directly as providers
    FirebaseAdminConfig,
    FcmService,
    NotificationTemplatesService,
    DeviceTokenService,
  ],
  controllers: [ChatController],
})
export class ChatModule {}
