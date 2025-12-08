import { IsBoolean, IsNumber, Min } from 'class-validator';

export class GoLiveDto {
  // Prices
  @IsNumber()
  @Min(0)
  voiceCallPrice: number;

  @IsNumber()
  @Min(0)
  videoCallPrice: number;

  // The 4 Types Configuration
  @IsBoolean()
  allowPublicVoice: boolean;

  @IsBoolean()
  allowPublicVideo: boolean;

  @IsBoolean()
  allowPrivateVoice: boolean;

  @IsBoolean()
  allowPrivateVideo: boolean;
}
