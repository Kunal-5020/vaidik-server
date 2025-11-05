// src/notifications/dto/mark-read.dto.ts (NEW)
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class MarkReadDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  notificationIds: string[];
}
