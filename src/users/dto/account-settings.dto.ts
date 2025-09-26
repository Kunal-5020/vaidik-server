import { IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class AccountSettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'Two factor authentication must be a boolean' })
  twoFactorEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Email notifications must be a boolean' })
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'SMS notifications must be a boolean' })
  smsNotifications?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Push notifications must be a boolean' })
  pushNotifications?: boolean;

  @IsOptional()
  @IsEnum(['public', 'friends', 'private'], {
    message: 'Profile visibility must be public, friends, or private'
  })
  profileVisibility?: string;

  @IsOptional()
  @IsBoolean({ message: 'Show online status must be a boolean' })
  showOnlineStatus?: boolean;
}
