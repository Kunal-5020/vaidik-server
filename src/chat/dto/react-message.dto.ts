// src/chat/dto/react-message.dto.ts
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class ReactMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsEnum(['❤️', '👍', '😂', '😮', '😢', '🙏'], {
    message: 'Invalid emoji reaction'
  })
  emoji: string;
}
