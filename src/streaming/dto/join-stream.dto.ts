import { IsString, IsNotEmpty } from 'class-validator';

export class JoinStreamDto {
  @IsString({ message: 'Stream ID must be a string' })
  @IsNotEmpty({ message: 'Stream ID is required' })
  streamId: string;
}
