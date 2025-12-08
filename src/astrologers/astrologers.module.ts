import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt'; // ✅ ADD

// Schemas
import { Astrologer, AstrologerSchema } from './schemas/astrologer.schema';
import { ProfileChangeRequest, ProfileChangeRequestSchema } from './schemas/profile-change-request.schema';

// Services
import { AstrologersService } from './services/astrologers.service';
import { AstrologerService } from './services/astrologer.service'; // ✅ ADD (you're using it in controller)
import { AvailabilityService } from './services/availability.service';
import { ProfileChangeService } from './services/profile-change.service';
import { EarningsService } from './services/earnings.service';
import { PenaltyService } from './services/penalty.service';
import { RatingReviewService } from './services/rating-review.service';

// Controllers
import { AstrologersController } from './controllers/astrologers.controller';
import { AstrologerProfileController } from './controllers/astrologer-profile.controller';

// ✅ Import UsersModule for UserBlockingService
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from 'src/auth/auth.module';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { Order, OrderSchema } from 'src/orders/schemas/orders.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: ProfileChangeRequest.name, schema: ProfileChangeRequestSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }), // ✅ ADD for JWT verification in controller
    UsersModule, // ✅ This imports UserBlockingService
    AuthModule, // ✅ This imports JWT services
    forwardRef(() => PaymentsModule),
  ],
  controllers: [
    AstrologersController,
    AstrologerProfileController,
  ],
  providers: [
    AstrologersService,
    AstrologerService, // ✅ ADD (you're using it in AstrologerProfileController)
    AvailabilityService,
    ProfileChangeService,
    EarningsService,
    PenaltyService,
    RatingReviewService,
  ],
  exports: [
    AstrologersService,
    AstrologerService, // ✅ ADD
    AvailabilityService,
    EarningsService,
    PenaltyService,
    MongooseModule,
    RatingReviewService,
  ],
})
export class AstrologersModule {}
