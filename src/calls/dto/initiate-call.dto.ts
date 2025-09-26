import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';

export class InitiateCallDto {
  @IsString()
  @IsNotEmpty()
  astrologerId: string;

  @IsEnum(['audio', 'video'])
  callType: 'audio' | 'video';

  @IsNumber()
  ratePerMinute: number;

  @IsOptional()
  @IsString()
  message?: string; // Optional message when initiating call
}
