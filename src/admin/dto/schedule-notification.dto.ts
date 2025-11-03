// admin/dto/schedule-notification.dto.ts (NEW)
import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  IsArray, 
  IsObject,
  IsDateString,
  MaxLength,
  ValidateIf
} from 'class-validator';

export class ScheduleNotificationDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Scheduled time is required' })
  scheduledFor: string; // ISO date string

  @IsEnum([
    'chat_message',
    'call_incoming',
    'order_completed',
    'payment_success',
    'wallet_recharged',
    'stream_started',
    'stream_reminder',
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

  @IsEnum(['all_users', 'all_astrologers', 'specific_users', 'followers'])
  @IsNotEmpty()
  recipientType: 'all_users' | 'all_astrologers' | 'specific_users' | 'followers';

  @ValidateIf(o => o.recipientType === 'specific_users')
  @IsArray()
  @IsString({ each: true })
  specificRecipients?: string[];

  @ValidateIf(o => o.recipientType === 'followers')
  @IsString()
  astrologerId?: string;
}
