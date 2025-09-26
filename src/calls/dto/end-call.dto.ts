import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class EndCallDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsOptional()
  @IsEnum(['completed', 'network_error', 'user_ended', 'astrologer_ended'])
  endReason?: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
