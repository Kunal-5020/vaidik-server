// src/notifications/dto/register-device.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  fcmToken: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsEnum(['android', 'ios', 'web'])
  @IsOptional()
  deviceType?: 'android' | 'ios' | 'web';

  @IsString()
  @IsOptional()
  deviceName?: string;
}
