// src/admin/dto/astrologer/get-astrologers-query.dto.ts
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { SearchQueryDto } from '../common/search-query.dto';

export enum AstrologerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

export class GetAstrologersQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(AstrologerStatus, { message: 'Invalid astrologer status' })
  status?: AstrologerStatus;

  @IsOptional()
  @IsString({ message: 'Specialization must be a string' })
  specialization?: string;
}
