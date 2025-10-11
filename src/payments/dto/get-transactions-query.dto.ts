import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(50, { message: 'Limit cannot exceed 50' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['recharge', 'deduction', 'refund', 'bonus'], {
    message: 'Invalid type'
  })
  type?: string;

  @IsOptional()
  @IsEnum(['pending', 'completed', 'failed', 'cancelled'], {
    message: 'Invalid status'
  })
  status?: string;
}
