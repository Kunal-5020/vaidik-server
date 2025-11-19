// src/chat/dto/astrologer-chat.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AstrologerAcceptChatDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

export class AstrologerRejectChatDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
