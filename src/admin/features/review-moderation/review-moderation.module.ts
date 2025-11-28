import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminReviewsController } from './controllers/admin-reviews.controller';
import { AdminReviewModerationService } from './services/admin-reviews.service';
import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';
import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { RatingReviewService } from '../../../astrologers/services/rating-review.service';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema';

@Module({
  imports: [
    ConfigModule, // ✅ Required
    JwtModule.registerAsync({ // ✅ Required
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminReviewsController],
  providers: [AdminReviewModerationService, RatingReviewService],
  exports: [AdminReviewModerationService],
})
export class ReviewModerationModule {}
