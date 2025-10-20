import { IsEnum, IsNotEmpty } from 'class-validator';

export class RequestCallDto {
  @IsEnum(['voice', 'video'])
  @IsNotEmpty()
  callType: 'voice' | 'video';

  @IsEnum(['public', 'private'])
  @IsNotEmpty()
  callMode: 'public' | 'private';
}
