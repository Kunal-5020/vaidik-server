// src/astrologers/controllers/astrologers.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ValidationPipe,
  HttpStatus,
  HttpException,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AstrologersService } from '../services/astrologers.service';
import { RatingReviewService } from '../services/rating-review.service';
import { SearchAstrologersDto } from '../dto/search-astrologers.dto';
import { AddReviewDto } from '../dto/add-review.dto';
import { UserBlockingService } from '../../users/services/user-blocking.service';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('astrologers')
@UseInterceptors(ClassSerializerInterceptor)
export class AstrologersController {
  constructor(
    private readonly astrologersService: AstrologersService,
    private readonly ratingReviewService: RatingReviewService,
    private readonly userBlockingService: UserBlockingService,
  ) {}

  /**
   * Search and filter astrologers with advanced options
   * GET /astrologers/search
   */
  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  async searchAstrologers(
    @Query(new ValidationPipe({ 
      transform: true, 
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true }
    })) 
    searchDto: SearchAstrologersDto,
    @Req() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.searchAstrologers(searchDto, userId);
  }

  /**
   * Get filter options
   * GET /astrologers/filter-options
   */
  @Get('filter-options')
  async getFilterOptions() {
    return this.astrologersService.getFilterOptions();
  }

  /**
   * Get all astrologers (legacy)
   * GET /astrologers
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAstrologers(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) 
    searchDto: SearchAstrologersDto,
    @Req() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.searchAstrologers(searchDto, userId);
  }

  /**
   * Get featured astrologers
   * GET /astrologers/featured
   */
  @Get('featured')
  @UseGuards(OptionalJwtAuthGuard)
  async getFeaturedAstrologers(
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getFeaturedAstrologers(parsedLimit, userId);
  }

  /**
   * Get top rated astrologers
   * GET /astrologers/top-rated
   */
  @Get('top-rated')
  @UseGuards(OptionalJwtAuthGuard)
  async getTopRatedAstrologers(
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getTopRatedAstrologers(parsedLimit, userId);
  }

  /**
   * Get online astrologers
   * GET /astrologers/online
   */
  @Get('online')
  @UseGuards(OptionalJwtAuthGuard)
  async getOnlineAstrologers(
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new HttpException('Limit must be between 1 and 100', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getOnlineAstrologers(parsedLimit, userId);
  }

  /**
   * Get live streaming astrologers
   * GET /astrologers/live
   */
  @Get('live')
  @UseGuards(OptionalJwtAuthGuard)
  async getLiveAstrologers(
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new HttpException('Limit must be between 1 and 100', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getLiveAstrologers(parsedLimit, userId);
  }

  /**
   * Get astrologers by specialization
   * GET /astrologers/specialization/:specialization
   */
  @Get('specialization/:specialization')
  @UseGuards(OptionalJwtAuthGuard)
  async getBySpecialization(
    @Param('specialization') specialization: string,
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getAstrologersBySpecialization(
      specialization.toLowerCase(),
      parsedLimit,
      userId
    );
  }

  /**
   * Get random astrologers
   * GET /astrologers/random
   */
  @Get('random')
  @UseGuards(OptionalJwtAuthGuard)
  async getRandomAstrologers(
    @Query('limit') limit?: number,
    @Req() req?: any
  ) {
    const parsedLimit = limit ? Number(limit) : 5;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      throw new HttpException('Limit must be between 1 and 20', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    return this.astrologersService.getRandomAstrologers(parsedLimit, userId);
  }

  /**
   * ✅ NEW: Add Review for Astrologer
   * POST /astrologers/:astrologerId/reviews
   */
  @Post(':astrologerId/reviews')
  @UseGuards(JwtAuthGuard)
  async addReview(
    @Param('astrologerId') astrologerId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) 
    reviewDto: AddReviewDto,
    @Req() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
    }

    return this.ratingReviewService.addReview({
      userId,
      astrologerId,
      orderId: reviewDto.orderId,
      rating: reviewDto.rating,
      reviewText: reviewDto.reviewText,
      serviceType: reviewDto.serviceType,
    });
  }

  /**
   * ✅ NEW: Get Reviews for Astrologer
   * GET /astrologers/:astrologerId/reviews
   */
  @Get(':astrologerId/reviews')
  @UseGuards(OptionalJwtAuthGuard)
  async getAstrologerReviews(
    @Param('astrologerId') astrologerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const parsedPage = page ? Number(page) : 1;
    const parsedLimit = limit ? Number(limit) : 10;
    
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new HttpException('Page must be at least 1', HttpStatus.BAD_REQUEST);
    }
    
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }

    return this.ratingReviewService.getAstrologerReviews(
      astrologerId, 
      parsedPage, 
      parsedLimit
    );
  }

  /**
   * ✅ NEW: Get Review Stats for Astrologer
   * GET /astrologers/:astrologerId/reviews/stats
   */
  @Get(':astrologerId/reviews/stats')
  async getReviewStats(@Param('astrologerId') astrologerId: string) {
    return this.ratingReviewService.getReviewStats(astrologerId);
  }

  /**
   * ✅ MODIFIED: Get single astrologer details WITH REVIEWS
   * GET /astrologers/:astrologerId
   */
  @Get(':astrologerId')
  @UseGuards(OptionalJwtAuthGuard)
  async getAstrologerDetails(
    @Param('astrologerId') astrologerId: string,
    @Query('includeReviews') includeReviews?: string,
    @Query('reviewLimit') reviewLimit?: number,
    @Req() req?: any
  ) {
    if (!astrologerId || astrologerId.trim() === '') {
      throw new HttpException('Astrologer ID is required', HttpStatus.BAD_REQUEST);
    }
    
    const userId = req.user?.userId || req.user?.id;
    
    // Check if user has blocked this astrologer
    if (userId) {
      const isBlocked = await this.userBlockingService.isAstrologerBlocked(
        userId as any,
        astrologerId
      );
      
      if (isBlocked) {
        throw new HttpException('Astrologer not found', HttpStatus.NOT_FOUND);
      }
    }
    
    const astrologer = await this.astrologersService.getAstrologerDetails(astrologerId);
    
    if (!astrologer) {
      throw new HttpException('Astrologer not found', HttpStatus.NOT_FOUND);
    }
    
    // ✅ Include reviews if requested (default: true)
    const shouldIncludeReviews = includeReviews !== 'false';
    const parsedReviewLimit = reviewLimit ? Number(reviewLimit) : 5;
    
    if (shouldIncludeReviews) {
      // ✅ Seed test reviews if none exist (for testing)
      await this.ratingReviewService.seedTestReviewsIfEmpty(astrologerId);
      
      // Get reviews
      const reviewsData = await this.ratingReviewService.getAstrologerReviews(
        astrologerId, 
        1, 
        parsedReviewLimit
      );
      
      return {
        ...astrologer,
        reviews: reviewsData.reviews,
        reviewsPagination: reviewsData.pagination,
      };
    }
    
    return astrologer;
  }
}
