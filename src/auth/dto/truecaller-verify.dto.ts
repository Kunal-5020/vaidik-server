// src/auth/dto/truecaller-verify.dto.ts (UPDATED)
import { IsString, IsNotEmpty } from 'class-validator';

export class TruecallerVerifyDto {
  @IsString()
  @IsNotEmpty()
  authorizationCode: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier: string;

  // ✅ ADD THESE FOR DEVICE STORAGE
  @IsString()
  fcmToken?: string;

  @IsString()
  deviceId?: string;

  @IsString()
  deviceType?: string; // 'android' | 'ios'

  @IsString()
  deviceName?: string;
}
