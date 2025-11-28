import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsEnum } from 'class-validator';

export class SendCallDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @IsEnum(['User', 'Astrologer'])
  @IsNotEmpty()
  recipientModel: 'User' | 'Astrologer';

  @IsString()
  @IsNotEmpty()
  callerId: string;

  @IsString()
  @IsNotEmpty()
  callerName: string;

  @IsOptional()
  @IsString()
  callerAvatar?: string;

  @IsBoolean()
  @IsNotEmpty()
  isVideo: boolean;

  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsOptional()
  @IsString()
  roomId?: string;
}
