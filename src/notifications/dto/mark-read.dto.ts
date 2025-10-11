import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class MarkReadDto {
  @IsArray({ message: 'Notification IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one notification ID is required' })
  @IsString({ each: true, message: 'Each notification ID must be a string' })
  notificationIds: string[];
}
