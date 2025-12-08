import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  Max
} from 'class-validator';

export class CreateStreamDto {
  // Configurable Call Settings for "Go Live"
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
  maxCallDuration?: number;
}