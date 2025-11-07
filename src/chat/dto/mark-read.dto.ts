// src/chat/dto/mark-read.dto.ts

import { IsArray, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class MarkReadDto {
  @IsArray({ message: 'Message IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one message ID is required' })
  @IsString({ each: true })
  messageIds: string[];

  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
