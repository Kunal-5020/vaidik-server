import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  Query,
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException
} from '@nestjs/common';
import { Request } from 'express';
import { AstrologersService } from './astrologers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CreateAstrologerDto } from './dto/create-astrologer.dto';
import { UpdateAstrologerDto } from './dto/update-astrologer.dto';
import { AstrologerSearchDto } from './dto/astrologer-search.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UserDocument } from '../users/schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('astrologers')
export class AstrologersController {
  constructor(private readonly astrologersService: AstrologersService) {}

  // === PUBLIC ENDPOINTS (No auth required) ===

  // Search astrologers (public)
  @Get('search')
  @UseGuards(OptionalAuthGuard)
  async searchAstrologers(@Query() searchDto: AstrologerSearchDto) {
    return this.astrologersService.searchAstrologers(searchDto);
  }

  // Get single astrologer by ID (public)
  @Get(':id')
  async getAstrologer(@Param('id') astrologerId: string) {
    return this.astrologersService.getAstrologerById(astrologerId);
  }

  // Get featured astrologers (public)
  @Get('lists/featured')
  async getFeaturedAstrologers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.astrologersService.getFeaturedAstrologers(limit);
  }

  // Get online astrologers (public)
  @Get('lists/online')
  async getOnlineAstrologers(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.astrologersService.getOnlineAstrologers(limit);
  }

  // Get top rated astrologers (public)
  @Get('lists/top-rated')
  async getTopRatedAstrologers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.astrologersService.getFeaturedAstrologers(limit); // Same as featured for now
  }

  // Get astrologers by specialization (public)
  @Get('specialization/:specialization')
  async getAstrologersBySpecialization(
    @Param('specialization') specialization: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.astrologersService.getAstrologersBySpecialization(specialization, limit);
  }

  // Get astrologer reviews (public)
  @Get(':id/reviews')
  async getAstrologerReviews(
    @Param('id') astrologerId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.astrologersService.getReviews(astrologerId, page, limit);
  }

  // Get astrologer review stats (public)
  @Get(':id/reviews/stats')
  async getReviewStats(@Param('id') astrologerId: string) {
    return this.astrologersService.getReviewStats(astrologerId);
  }

  // Get available specializations (public)
  @Get('meta/specializations')
  async getSpecializations() {
    return this.astrologersService.getSpecializations();
  }

  // Get available languages (public)
  @Get('meta/languages')
  async getLanguages() {
    return this.astrologersService.getLanguages();
  }

  // === AUTHENTICATED USER ENDPOINTS ===

  // Create astrologer profile (user becomes astrologer)
  @Post('register')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createAstrologer(
    @Req() req: AuthenticatedRequest,
    @Body() createAstrologerDto: CreateAstrologerDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.astrologersService.createAstrologer(userId, createAstrologerDto);
  }

  // Add review for astrologer (authenticated user only)
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addReview(
    @Req() req: AuthenticatedRequest,
    @Param('id') astrologerId: string,
    @Body() reviewData: {
      orderId: string;
      rating: number;
      review?: string;
      serviceType: 'chat' | 'call';
    }
  ) {
    const userId = (req.user._id as any).toString();
    
    return this.astrologersService.addReview({
      userId,
      astrologerId,
      orderId: reviewData.orderId,
      rating: reviewData.rating,
      review: reviewData.review,
      serviceType: reviewData.serviceType
    });
  }

  // === ASTROLOGER DASHBOARD ENDPOINTS (For astrologers managing their profile) ===

  // Update own astrologer profile
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateOwnProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateDto: UpdateAstrologerDto
  ) {
    // Find astrologer by userId
    const userId = (req.user._id as any).toString();
    
    // Note: You might want to add a method to find astrologer by userId
    // For now, assuming you pass astrologerId in the request
    const astrologerId = req.query.astrologerId as string;
    
    if (!astrologerId) {
      throw new BadRequestException('Astrologer ID is required');
    }

    return this.astrologersService.updateAstrologer(astrologerId, updateDto);
  }

  // Update availability and working hours
  @Put('availability')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateAvailability(
    @Req() req: AuthenticatedRequest,
    @Body() updateDto: UpdateAvailabilityDto
  ) {
    const astrologerId = req.query.astrologerId as string;
    
    if (!astrologerId) {
      throw new BadRequestException('Astrologer ID is required');
    }

    return this.astrologersService.updateAvailability(astrologerId, updateDto);
  }

  // Get own earnings and stats
  @Get('dashboard/earnings')
  @UseGuards(JwtAuthGuard)
  async getOwnEarnings(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.query.astrologerId as string;
    
    if (!astrologerId) {
      throw new BadRequestException('Astrologer ID is required');
    }

    return this.astrologersService.getEarningsStats(astrologerId);
  }

  // === QUICK STATUS ENDPOINTS ===

  // Quick status update (online/offline/busy)
  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') astrologerId: string,
    @Body() statusData: { status: 'online' | 'offline' | 'busy' }
  ) {
    return this.astrologersService.updateAvailability(astrologerId, {
      status: statusData.status
    });
  }

  // Get astrologer dashboard summary
  @Get(':id/dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboardSummary(@Param('id') astrologerId: string) {
    return this.astrologersService.getEarningsStats(astrologerId);
  }
}
