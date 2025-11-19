import {
  Controller,
  Get,
  Param,
  Query,
  ValidationPipe,
  HttpStatus,
  HttpException,
  UseInterceptors,
  ClassSerializerInterceptor
} from '@nestjs/common';
import { AstrologersService } from '../services/astrologers.service';
import { SearchAstrologersDto } from '../dto/search-astrologers.dto';

@Controller('astrologers')
@UseInterceptors(ClassSerializerInterceptor)
export class AstrologersController {
  constructor(
    private readonly astrologersService: AstrologersService) {}

  /**
   * Search and filter astrologers with advanced options
   * GET /astrologers/search
   * 
   * Query params:
   * - search: text search in name/bio
   * - skills: array of specializations
   * - languages: array of languages
   * - genders: array of genders
   * - countries: array of countries
   * - topAstrologers: array of tier filters
   * - sortBy: sort option (popularity, rating, price, etc)
   * - minPrice, maxPrice: price range
   * - minRating: minimum rating filter
   * - minExperience, maxExperience: experience range
   * - isOnline: filter online astrologers
   * - isLive: filter live streaming astrologers
   * - page, limit: pagination
   */
  @Get('search')
async searchAstrologers(
  @Query(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: true } // ✅ Add this
  })) 
  searchDto: SearchAstrologersDto
) {
  console.log('📥 Received search params:', searchDto);
  return this.astrologersService.searchAstrologers(searchDto);
}


  /**
   * Get available filter options with counts
   * GET /astrologers/filter-options
   * 
   * Returns all available specializations, languages, etc. with counts
   * Useful for building dynamic filter UI
   */
  @Get('filter-options')
  async getFilterOptions() {
    return this.astrologersService.getFilterOptions();
  }

  /**
   * Get all approved astrologers (legacy endpoint - consider deprecating)
   * GET /astrologers
   * Use /astrologers/search instead for better filtering
   */
  @Get()
  async getAstrologers(
    @Query(new ValidationPipe({ 
      transform: true, 
      whitelist: true 
    })) 
    searchDto: SearchAstrologersDto
  ) {
    // Redirect to search with default filters
    return this.astrologersService.searchAstrologers(searchDto);
  }

  /**
   * Get featured astrologers (high rated, popular)
   * GET /astrologers/featured
   */
  @Get('featured')
  async getFeaturedAstrologers(
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getFeaturedAstrologers(parsedLimit);
  }

  /**
   * Get top rated astrologers
   * GET /astrologers/top-rated
   */
  @Get('top-rated')
  async getTopRatedAstrologers(
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getTopRatedAstrologers(parsedLimit);
  }

  /**
   * Get all currently online astrologers
   * GET /astrologers/online
   */
  @Get('online')
  async getOnlineAstrologers(
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new HttpException('Limit must be between 1 and 100', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getOnlineAstrologers(parsedLimit);
  }

  /**
   * Get all live streaming astrologers (for users to watch)
   * GET /astrologers/live
   */
  @Get('live')
  async getLiveAstrologers(
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 20;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new HttpException('Limit must be between 1 and 100', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getLiveAstrologers(parsedLimit);
  }

  /**
   * Get astrologers by specific specialization
   * GET /astrologers/specialization/:specialization
   */
  @Get('specialization/:specialization')
  async getBySpecialization(
    @Param('specialization') specialization: string,
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new HttpException('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getAstrologersBySpecialization(
      specialization.toLowerCase(),
      parsedLimit
    );
  }

  /**
   * Get random astrologers (for discovery/recommendations)
   * GET /astrologers/random
   */
  @Get('random')
  async getRandomAstrologers(
    @Query('limit') limit?: number
  ) {
    const parsedLimit = limit ? Number(limit) : 5;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      throw new HttpException('Limit must be between 1 and 20', HttpStatus.BAD_REQUEST);
    }
    return this.astrologersService.getRandomAstrologers(parsedLimit);
  }

  /**
   * Get single astrologer details (public profile)
   * GET /astrologers/:astrologerId
   * Note: This should be last to avoid route conflicts
   */
  @Get(':astrologerId')
  async getAstrologerDetails(
    @Param('astrologerId') astrologerId: string
  ) {
    if (!astrologerId || astrologerId.trim() === '') {
      throw new HttpException('Astrologer ID is required', HttpStatus.BAD_REQUEST);
    }
    
    const astrologer = await this.astrologersService.getAstrologerDetails(astrologerId);
    
    if (!astrologer) {
      console.warn(`⚠️ Astrologer with ID ${astrologerId} not found.`);
      throw new HttpException('Astrologer not found', HttpStatus.NOT_FOUND);
    }
    console.log(`Astrologer with ID ${astrologerId} is found.`);
    return astrologer;
  }

}
