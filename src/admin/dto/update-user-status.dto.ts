import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @IsEnum(['active', 'blocked', 'deleted'], {
    message: 'Status must be active, blocked, or deleted',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: string;
}
