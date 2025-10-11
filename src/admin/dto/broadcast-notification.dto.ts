import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  MaxLength
} from 'class-validator';

export class BroadcastNotificationDto {
  @IsEnum(['all', 'users', 'astrologers'], {
    message: 'Target must be all, users, or astrologers',
  })
  target: string;

  @IsOptional()
  @IsArray({ message: 'Filters must be an array' })
  filters?: string[];

  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsString({ message: 'Message must be a string' })
  @IsNotEmpty({ message: 'Message is required' })
  @MaxLength(1000, { message: 'Message cannot exceed 1000 characters' })
  message: string;

  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  imageUrl?: string;

  @IsOptional()
  @IsString({ message: 'Action URL must be a string' })
  actionUrl?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'], { message: 'Invalid priority' })
  priority?: string;
}
