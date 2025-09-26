import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FirebaseAdminConfig } from './firebase-admin.config';
import { FcmService } from './fcm.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { DeviceTokenService } from '../users/services/device-token.service';
import { DeviceTokenController } from '../users/controllers/device-token.controller';
import { User, UserSchema } from '../users/schemas/user.schema';

@Global() // Make it global so other modules can use it
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
    ]),
  ],
  providers: [
    FirebaseAdminConfig,
    FcmService,
    NotificationTemplatesService,
    DeviceTokenService,
  ],
  controllers: [DeviceTokenController],
  exports: [
    FirebaseAdminConfig,
    FcmService,
    NotificationTemplatesService,
    DeviceTokenService,
  ],
})
export class FirebaseModule {}
