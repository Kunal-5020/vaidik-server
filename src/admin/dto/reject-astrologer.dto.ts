import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RejectAstrologerDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
