// src/chat/dto/initiate-chat.dto.ts

import { IsMongoId, IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class InitiateChatDto {
  @IsMongoId({ message: 'Invalid astrologer ID' })
  @IsNotEmpty({ message: 'Astrologer ID is required' })
  astrologerId: string;

  @IsString({ message: 'Astrologer name must be a string' })
  @IsNotEmpty({ message: 'Astrologer name is required' })
  astrologerName: string;

  @IsNumber({}, { message: 'Rate per minute must be a number' })
  @Min(1, { message: 'Rate must be at least 1' })
  ratePerMinute: number;
}
