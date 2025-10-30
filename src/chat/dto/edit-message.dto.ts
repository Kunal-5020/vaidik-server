// src/chat/dto/edit-message.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  newContent: string;
}
