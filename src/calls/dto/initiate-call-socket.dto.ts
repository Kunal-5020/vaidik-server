import { IsString, IsNotEmpty, IsMongoId, IsEnum } from 'class-validator';

export class InitiateCallSocketDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsMongoId()
  callerId: string;

  @IsMongoId()
  receiverId: string;

  @IsString()
  @IsNotEmpty()
  callerName: string;

  @IsEnum(['audio', 'video'])
  callType: 'audio' | 'video';
}