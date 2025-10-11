import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ApproveAstrologerDto {
  @IsOptional()
  @IsString({ message: 'Admin notes must be a string' })
  @MaxLength(500, { message: 'Admin notes cannot exceed 500 characters' })
  adminNotes?: string;
}
