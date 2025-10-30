// src/chat/dto/reply-message.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { SendMessageDto } from './send-message.dto';

export class ReplyMessageDto extends SendMessageDto {
  @IsString()
  @IsNotEmpty()
  replyToMessageId: string;
}
