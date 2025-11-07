// src/chat/dto/end-chat.dto.ts

import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class EndChatDto {
  @IsString({ message: 'Session ID must be a string' })
  @IsNotEmpty({ message: 'Session ID is required' })
  sessionId: string;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}
