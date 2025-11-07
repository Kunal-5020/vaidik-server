// src/calls/dto/initiate-call.dto.ts

import { IsMongoId, IsNotEmpty, IsString, IsNumber, IsEnum, Min } from 'class-validator';

export class InitiateCallDto {
  @IsMongoId({ message: 'Invalid astrologer ID' })
  @IsNotEmpty({ message: 'Astrologer ID is required' })
  astrologerId: string;

  @IsString({ message: 'Astrologer name must be a string' })
  @IsNotEmpty({ message: 'Astrologer name is required' })
  astrologerName: string;

  @IsEnum(['audio', 'video'], { message: 'Call type must be audio or video' })
  @IsNotEmpty({ message: 'Call type is required' })
  callType: 'audio' | 'video';

  @IsNumber({}, { message: 'Rate per minute must be a number' })
  @Min(1, { message: 'Rate must be at least 1' })
  ratePerMinute: number;
}
