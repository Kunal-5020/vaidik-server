import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class JoinCallDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsOptional()
  @IsBoolean()
  withVideo?: boolean; // Join with video enabled/disabled
}
