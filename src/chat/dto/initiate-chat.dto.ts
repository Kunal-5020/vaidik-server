// src/chat/dto/initiate-chat.dto.ts
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class InitiateChatDto {
  @IsMongoId()
  @IsNotEmpty()
  astrologerId: string;
}
