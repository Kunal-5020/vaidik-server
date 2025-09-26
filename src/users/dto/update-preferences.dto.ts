import { IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsEnum(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur'], {
    message: 'App language must be a supported language code'
  })
  appLanguage?: string;

  @IsOptional()
  @IsBoolean({ message: 'Live events notification must be a boolean' })
  liveEventsNotification?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Normal notification must be a boolean' })
  normalNotification?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Name visible in reviews must be a boolean' })
  nameVisibleInReviews?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Astrologer chat access after end must be a boolean' })
  astrologerChatAccessAfterEnd?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Download shared images must be a boolean' })
  downloadSharedImages?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Restrict chat screenshots must be a boolean' })
  restrictChatScreenshots?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Access call recording must be a boolean' })
  accessCallRecording?: boolean;
}
