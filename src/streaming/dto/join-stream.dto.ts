import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class JoinStreamDto {
  @IsString()
  @IsNotEmpty()
  streamId: string;

  @IsOptional()
  @IsBoolean()
  asViewer?: boolean; // true for viewer, false for host
}
