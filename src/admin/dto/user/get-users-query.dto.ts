// src/admin/dto/user/get-users-query.dto.ts
import { IsOptional, IsEnum } from 'class-validator';
import { SearchQueryDto } from '../common/search-query.dto';

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export class GetUsersQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Invalid user status' })
  status?: UserStatus;
}
