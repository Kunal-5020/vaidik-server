// admin/dto/schedule-notification.dto.ts (FIXED)
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsMongoId,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export class ScheduleNotificationDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Scheduled time is required' })
  scheduledFor: string; // ISO string

  @IsEnum([
    'chat_message',
    'call_incoming',
    'order_completed',
    'payment_success',
    'wallet_recharged',
    'stream_started',
    'system_announcement',
    'general',
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

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  // ✅ FIXED: Properly typed enum instead of string
  @IsEnum(['all_users', 'all_astrologers', 'specific_users', 'followers'], {
    message: 'recipientType must be one of: all_users, all_astrologers, specific_users, followers'
  })
  @IsNotEmpty({ message: 'Recipient type is required' })
  recipientType: 'all_users' | 'all_astrologers' | 'specific_users' | 'followers';

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  @ArrayMinSize(1, { message: 'At least one user ID required for specific_users' })
  specificRecipients?: string[];

  @IsMongoId({ message: 'Invalid astrologer ID' })
  @IsOptional()
  astrologerId?: string;

  // ✅ ADD optional data field for additional context
  @IsOptional()
  data?: Record<string, any>;
}
