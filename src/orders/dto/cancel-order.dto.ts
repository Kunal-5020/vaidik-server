import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Cancellation reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(200, { message: 'Reason cannot exceed 200 characters' })
  reason: string;
}
