// src/chat/dto/send-message.dto.ts

import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsEnum(['text', 'image', 'audio', 'video', 'file'], {
    message: 'Type must be: text, image, audio, video, or file'
  })
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000, { message: 'Message cannot exceed 5000 characters' })
  content: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileS3Key?: string;

  @IsOptional()
  replyTo?: string;
}
