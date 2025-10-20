import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min
} from 'class-validator';

export class UpdateCallSettingsDto {
  @IsOptional()
  @IsBoolean()
  isCallEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  voiceCallPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  videoCallPrice?: number;

  @IsOptional()
  @IsBoolean()
  allowPublicCalls?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPrivateCalls?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(60)
  maxCallDuration?: number;
}
