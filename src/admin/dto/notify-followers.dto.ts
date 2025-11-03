// admin/dto/notify-followers.dto.ts (NEW)
import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  IsObject,
  MaxLength
} from 'class-validator';

export class NotifyFollowersDto {
  @IsEnum(['stream_started', 'stream_reminder'])
  @IsNotEmpty()
  type: 'stream_started' | 'stream_reminder';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  actionUrl?: string;
}
