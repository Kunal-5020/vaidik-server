import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';

export class TruecallerVerifyDto {
  @IsString()
  @IsNotEmpty()
  authorizationCode: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier: string;

}
