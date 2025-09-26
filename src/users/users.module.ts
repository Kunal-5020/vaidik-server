import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { FileUploadService } from './services/file-upload.service';
import { AwsS3Service } from './services/aws-s3.service';
import { ProfileCompletionService } from './services/profile-completion.service';
import { User, UserSchema } from './schemas/user.schema';
import { multerConfig } from '../common/static-files.config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
    ]),
    MulterModule.register(multerConfig),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    FileUploadService,
    AwsS3Service, 
    ProfileCompletionService,
  ],
  exports: [
    UsersService,
    MongooseModule,
  ],
})
export class UsersModule {}
