import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsMongoId,
  MinLength,
  MaxLength
} from 'class-validator';

export class CreateRemedyDto {
  @IsMongoId({ message: 'Invalid user ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsString({ message: 'Order ID must be a string' })
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;

  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsString({ message: 'Description must be a string' })
  @IsNotEmpty({ message: 'Description is required' })
  @MinLength(20, { message: 'Description must be at least 20 characters' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description: string;

  @IsEnum(['gemstone', 'mantra', 'puja', 'donation', 'yantra', 'other'], {
    message: 'Invalid remedy type'
  })
  @IsNotEmpty({ message: 'Remedy type is required' })
  type: string;
}
