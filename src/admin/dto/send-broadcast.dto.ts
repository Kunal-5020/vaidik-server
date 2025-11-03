// admin/dto/send-broadcast.dto.ts (NEW)
import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  IsArray, 
  IsObject,
  MaxLength,
  ArrayMinSize
} from 'class-validator';

export class SendBroadcastDto {
  @IsEnum([
    'chat_message',
    'call_incoming',
    'order_completed',
    'payment_success',
    'wallet_recharged',
    'stream_started',
    'system_announcement',
    'general'
  ])
  @IsNotEmpty()
  type: string;

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

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export class SendBroadcastToUsersDto extends SendBroadcastDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one user ID is required' })
  @IsString({ each: true })
  userIds: string[];
}
