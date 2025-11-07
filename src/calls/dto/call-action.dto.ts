// src/calls/dto/call-action.dto.ts

import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';

export class CallActionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsEnum(['mute', 'unmute', 'video_off', 'video_on', 'switch_camera', 'hold', 'resume'], {
    message: 'Invalid action'
  })
  action: string;

  @IsOptional()
  @IsString()
  value?: string; // For camera switch (front/back)
}
