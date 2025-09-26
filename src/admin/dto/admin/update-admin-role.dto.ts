// src/admin/dto/admin/update-admin-role.dto.ts
import { IsEnum } from 'class-validator';
import { AdminRole } from '../../enums/admin-role.enum';

export class UpdateAdminRoleDto {
  @IsEnum(AdminRole, { message: 'Invalid admin role' })
  role: AdminRole;
}
