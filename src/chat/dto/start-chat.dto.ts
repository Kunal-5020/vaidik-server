import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class StartChatDto {
  @IsMongoId({ message: 'Invalid astrologer ID' })
  @IsNotEmpty({ message: 'Astrologer ID is required' })
  astrologerId: string;
}
