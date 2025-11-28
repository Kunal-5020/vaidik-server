import { IsNumber, IsEnum, IsString, IsNotEmpty, Min } from 'class-validator';

export class ProcessRefundDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsEnum(['gateway', 'wallet'])
  refundType: 'gateway' | 'wallet';

  @IsString()
  @IsNotEmpty()
  reason: string;
}
