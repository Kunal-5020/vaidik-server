import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateAstrologerStatusDto {
  @IsEnum(['active', 'inactive', 'blocked', 'deleted'], {
    message: 'Status must be active, inactive, blocked, or deleted',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: string;
}
