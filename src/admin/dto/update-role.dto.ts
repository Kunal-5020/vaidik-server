import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength
} from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MinLength(3, { message: 'Name must be at least 3 characters' })
  @MaxLength(50, { message: 'Name cannot exceed 50 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Permissions must be an array' })
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
