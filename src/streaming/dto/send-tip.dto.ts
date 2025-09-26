import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class SendTipDto {
  @IsString()
  @IsNotEmpty()
  streamId: string;

  @IsNumber()
  @Min(1)
  @Max(10000)
  amount: number;

  @IsOptional()
  @IsString()
  @Max(200)
  message?: string;
}
