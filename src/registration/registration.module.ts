import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegistrationController } from './controllers/registration.controller';
import { RegistrationService } from './services/registration.service';
import { Registration, RegistrationSchema } from './schemas/registration.schema';
import { AuthModule } from '../auth/auth.module'; // Import your OTP module

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Registration.name, schema: RegistrationSchema }
    ]),
    AuthModule // Import OTP module to use OtpService
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService, MongooseModule] // Export for admin module usage
})
export class RegistrationModule {}
