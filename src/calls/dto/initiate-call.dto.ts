import { IsString, IsNotEmpty, IsMongoId, IsEnum } from 'class-validator';

export class InitiateCallDto {
  @IsMongoId({ message: 'Invalid astrologer ID' })
  @IsNotEmpty({ message: 'Astrologer ID is required' })
  astrologerId: string;

  @IsEnum(['audio', 'video'], { message: 'Call type must be audio or video' })
  callType: 'audio' | 'video';
}
