import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsEnum, IsArray, IsDateString, Min, Max, Length } from 'class-validator';

export class CreateStreamDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 100, { message: 'Title must be between 5 and 100 characters' })
  title: string;

  @IsOptional()
  @IsString()
  @Length(10, 500, { message: 'Description must be between 10 and 500 characters' })
  description?: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(['general', 'astrology', 'tarot', 'numerology', 'palmistry'])
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  entryFee?: number;

  @IsOptional()
  @IsBoolean()
  allowChat?: boolean;

  @IsOptional()
  @IsBoolean()
  allowTips?: boolean;

  @IsOptional()
  @IsBoolean()
  allowQuestions?: boolean;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
