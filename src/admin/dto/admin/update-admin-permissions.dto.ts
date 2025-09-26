// src/admin/dto/admin/update-admin-permissions.dto.ts
import { IsArray, IsEnum, ArrayNotEmpty } from 'class-validator';
import { AdminPermission } from '../../enums/admin-role.enum';

export class UpdateAdminPermissionsDto {
  @IsArray({ message: 'Permissions must be an array' })
  @ArrayNotEmpty({ message: 'Permissions array cannot be empty' })
  @IsEnum(AdminPermission, { 
    each: true, 
    message: 'Invalid permission in permissions array' 
  })
  permissions: AdminPermission[];
}
