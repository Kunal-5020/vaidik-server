// src/calls/dto/end-call.dto.ts

import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class EndCallDto {
  @IsString({ message: 'Session ID must be a string' })
  @IsNotEmpty({ message: 'Session ID is required' })
  sessionId: string;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}
