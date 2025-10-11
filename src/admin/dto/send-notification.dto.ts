import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
  IsArray,
  MaxLength
} from 'class-validator';

export class SendNotificationDto {
  @IsMongoId({ message: 'Invalid recipient ID' })
  @IsNotEmpty({ message: 'Recipient ID is required' })
  recipientId: string;

  @IsEnum(['User', 'Astrologer'], { message: 'Invalid recipient model' })
  recipientModel: 'User' | 'Astrologer';

  @IsString({ message: 'Type must be a string' })
  @IsNotEmpty({ message: 'Type is required' })
  type: string;

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
