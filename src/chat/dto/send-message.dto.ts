import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString({ message: 'Session ID must be a string' })
  @IsNotEmpty({ message: 'Session ID is required' })
  sessionId: string;

  @IsEnum(['text', 'image', 'audio', 'video', 'document'], {
    message: 'Invalid message type'
  })
  type: string;

  @IsString({ message: 'Content must be a string' })
  @IsNotEmpty({ message: 'Content is required' })
  @MaxLength(5000, { message: 'Content cannot exceed 5000 characters' })
  content: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
