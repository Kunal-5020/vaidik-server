import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsMongoId,
  IsOptional,
  MinLength,
  MaxLength
} from 'class-validator';

export class CreateReportDto {
  @IsMongoId({ message: 'Invalid user ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsString({ message: 'Order ID must be a string' })
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;

  @IsEnum(['kundli', 'yearly_prediction', 'compatibility', 'numerology', 'palmistry', 'other'], {
    message: 'Invalid report type'
  })
  @IsNotEmpty({ message: 'Report type is required' })
  type: string;

  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Content must be a string' })
  content?: string;
}
