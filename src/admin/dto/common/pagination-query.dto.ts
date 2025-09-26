// src/admin/dto/common/pagination-query.dto.ts (Fixed)
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer'; // Fix: Import Transform from class-transformer

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be greater than 0' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be greater than 0' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;
}
