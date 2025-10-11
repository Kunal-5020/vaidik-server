import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';

export class UploadIntroAudioDto {
  @IsString({ message: 'Audio URL must be a string' })
  @IsNotEmpty({ message: 'Audio URL is required' })
  audioUrl: string;

  @IsString({ message: 'S3 key must be a string' })
  @IsNotEmpty({ message: 'S3 key is required' })
  s3Key: string;

  @IsNumber({}, { message: 'Duration must be a number' })
  @Min(5, { message: 'Audio must be at least 5 seconds' })
  @Max(180, { message: 'Audio cannot exceed 3 minutes (180 seconds)' })
  duration: number;
}
