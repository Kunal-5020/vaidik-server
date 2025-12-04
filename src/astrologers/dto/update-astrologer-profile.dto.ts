// src/astrologers/dto/update-astrologer-profile.dto.ts

import { IsString, IsOptional, IsArray, IsNumber, Min, Max, IsBoolean, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAstrologerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  @IsBoolean()
  isChatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isCallEnabled?: boolean;
}
