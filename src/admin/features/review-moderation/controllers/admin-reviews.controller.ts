import { 
  Controller, 
  Get, 
  Patch, 
  Param, 
  Query, 
  Body, 
  UseGuards, 
  Req 
} from '@nestjs/common';
import { AdminReviewModerationService } from '../services/admin-reviews.service';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { Types } from 'mongoose';

@Controller('admin/reviews')
@UseGuards(JwtAuthGuard) // Add admin role guard if you have one
export class AdminReviewsController {
  constructor(
    private readonly adminReviewsModerationService: AdminReviewModerationService
  ) {}

  // Get reviews for moderation
  @Get()
  async getReviews(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status: any = 'pending',
  ) {
    return this.adminReviewsModerationService.getReviewsForModeration(+page, +limit, status);
  }

  // Get moderation stats
  @Get('stats')
  async getStats() {
    return this.adminReviewsModerationService.getModerationStats();
  }

  // Approve review
  @Patch(':id/approve')
  async approveReview(@Param('id') id: string, @Req() req) {
    return this.adminReviewsModerationService.approveReview(
      id, 
      new Types.ObjectId(req.user.userId)
    );
  }

  // Reject review
  @Patch(':id/reject')
  async rejectReview(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    return this.adminReviewsModerationService.rejectReview(
      id,
      new Types.ObjectId(req.user.userId),
      body.reason,
    );
  }

  // Flag review
  @Patch(':id/flag')
  async flagReview(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { reason: string },
  ) {
    return this.adminReviewsModerationService.flagReview(
      id,
      new Types.ObjectId(req.user.userId),
      body.reason,
    );
  }
}
