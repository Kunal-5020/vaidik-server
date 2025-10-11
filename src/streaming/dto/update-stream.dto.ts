import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsUrl
} from 'class-validator';

export class UpdateStreamDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Thumbnail must be a valid URL' })
  thumbnailUrl?: string;

  @IsOptional()
  @IsBoolean({ message: 'Allow comments must be a boolean' })
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Allow gifts must be a boolean' })
  allowGifts?: boolean;
}
