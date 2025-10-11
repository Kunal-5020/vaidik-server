import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { Astrologer, AstrologerSchema } from './schemas/astrologer.schema';
import { ProfileChangeRequest, ProfileChangeRequestSchema } from './schemas/profile-change-request.schema';

// Services
import { AstrologersService } from './services/astrologers.service';
import { OnboardingService } from './services/onboarding.service';
import { AvailabilityService } from './services/availability.service';
import { ProfileChangeService } from './services/profile-change.service';
import { EarningsService } from './services/earnings.service';

// Controllers
import { AstrologersController } from './controllers/astrologers.controller';
import { AstrologerProfileController } from './controllers/astrologer-profile.controller';
import { AstrologerOnboardingController } from './controllers/astrologer-onboarding.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: ProfileChangeRequest.name, schema: ProfileChangeRequestSchema },
    ]),
  ],
  controllers: [
    AstrologersController,
    AstrologerProfileController,
    AstrologerOnboardingController,
  ],
  providers: [
    AstrologersService,
    OnboardingService,
    AvailabilityService,
    ProfileChangeService,
    EarningsService,
  ],
  exports: [
    AstrologersService,
    OnboardingService,
    AvailabilityService,
    EarningsService,
  ],
})
export class AstrologersModule {}
