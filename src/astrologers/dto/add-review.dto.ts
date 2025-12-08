// src/astrologers/dto/add-review.dto.ts

import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  Min, 
  Max, 
  IsEnum, 
  IsOptional,
  Length 
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddReviewDto {
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reviewText?: string;

  @IsNotEmpty()
  @IsEnum(['chat', 'call', 'video_call'])
  serviceType: 'chat' | 'call' | 'video_call';
}
