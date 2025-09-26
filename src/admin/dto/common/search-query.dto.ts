// src/admin/dto/common/search-query.dto.ts (Fixed)
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto'; // Fix: Add proper import

export class SearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString({ message: 'Search term must be a string' })
  @MinLength(2, { message: 'Search term must be at least 2 characters long' })
  search?: string;
}
