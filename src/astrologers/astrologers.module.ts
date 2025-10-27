import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { Astrologer, AstrologerSchema } from './schemas/astrologer.schema';
import { ProfileChangeRequest, ProfileChangeRequestSchema } from './schemas/profile-change-request.schema';

// Services
import { AstrologersService } from './services/astrologers.service';
import { AvailabilityService } from './services/availability.service';
import { ProfileChangeService } from './services/profile-change.service';
import { EarningsService } from './services/earnings.service';

// Controllers
import { AstrologersController } from './controllers/astrologers.controller';
import { AstrologerProfileController } from './controllers/astrologer-profile.controller';

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
  ],
  providers: [
    AstrologersService,
    AvailabilityService,
    ProfileChangeService,
    EarningsService,
  ],
  exports: [
    AstrologersService,
    AvailabilityService,
    EarningsService,
    MongooseModule,
  ],
})
export class AstrologersModule {}
