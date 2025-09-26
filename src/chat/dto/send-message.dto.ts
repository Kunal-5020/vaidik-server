import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsIn(['user', 'astrologer'])
  role: 'user' | 'astrologer';

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['text', 'image', 'audio']) // Added 'audio' type
  type?: 'text' | 'image' | 'audio';

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsNumber()
  duration?: number; // For audio messages
}
