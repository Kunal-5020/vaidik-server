import {
  Controller,
  Get,
  Param,
  Query,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { AstrologersService } from '../services/astrologers.service';
import { SearchAstrologersDto } from '../dto/search-astrologers.dto';

@Controller('astrologers')
export class AstrologersController {
  constructor(private astrologersService: AstrologersService) {}

  // Get all approved astrologers (public listing)
  @Get()
  async getAstrologers(
    @Query(ValidationPipe) searchDto: SearchAstrologersDto
  ) {
    return this.astrologersService.getApprovedAstrologers(
      searchDto.page,
      searchDto.limit,
      {
        specializations: searchDto.specializations,
        languages: searchDto.languages,
        minRating: searchDto.minRating,
        isOnline: searchDto.isOnline,
        sortBy: searchDto.sortBy
      }
    );
  }

  // Get single astrologer details
  @Get(':astrologerId')
  async getAstrologerDetails(@Param('astrologerId') astrologerId: string) {
    return this.astrologersService.getAstrologerDetails(astrologerId);
  }
}
