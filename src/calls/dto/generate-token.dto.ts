import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateTokenDto {
  @IsString({ message: 'Session ID must be a string' })
  @IsNotEmpty({ message: 'Session ID is required' })
  sessionId: string;
}
