import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShortlistDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
