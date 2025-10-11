import { IsString, IsNotEmpty } from 'class-validator';

export class RegisterDeviceDto {
  @IsString({ message: 'FCM token must be a string' })
  @IsNotEmpty({ message: 'FCM token is required' })
  fcmToken: string;
}
