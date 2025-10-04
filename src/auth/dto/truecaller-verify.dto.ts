// src/auth/dto/truecaller-verify.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class TruecallerVerifyDto {
  @IsString()
  @IsNotEmpty()
  authorizationCode: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier: string;
}
