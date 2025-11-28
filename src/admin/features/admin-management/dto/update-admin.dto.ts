// src/admin/features/admin-management/dto/update-admin.dto.ts
import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
} from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customPermissions?: string[];
}
