import { IsString, IsNotEmpty } from 'class-validator';

export class TruecallerVerifyDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  payload: string;

  @IsString()
  @IsNotEmpty()
  signatureAlgorithm: string;
}
