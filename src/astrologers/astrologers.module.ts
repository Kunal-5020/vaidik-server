import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AstrologersService } from './astrologers.service';
import { AstrologersController } from './astrologers.controller';
import { AstrologerSearchService } from './services/astrologer-search.service';
import { RatingReviewService } from './services/rating-review.service';

// Schemas
import { Astrologer, AstrologerSchema } from './schemas/astrologer.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: User.name, schema: UserSchema } // Needed for rating service
    ]),
  ],
  controllers: [AstrologersController],
  providers: [
    AstrologersService,
    AstrologerSearchService,
    RatingReviewService,
  ],
  exports: [
    AstrologersService,
    MongooseModule,
  ],
})
export class AstrologersModule {}
