import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';
import { DeviceTokenService } from './services/device-token.service';
import { User, UserSchema } from './schemas/user.schema';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, DeviceTokenService],
  exports: [UsersService, DeviceTokenService, MongooseModule],
})
export class UsersModule {}
