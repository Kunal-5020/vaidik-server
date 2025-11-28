// src/admin/features/notifications/dto/schedule-notification.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  MaxLength,
  IsUrl,
  IsDateString,
} from 'class-validator';

export class ScheduleNotificationDto {
  @IsDateString()
  @IsNotEmpty()
  scheduledFor: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsUrl()
  actionUrl?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent']) // ✅ Keep enum
  priority?: 'low' | 'medium' | 'high' | 'urgent'; // ✅ Add union type

  @IsEnum(['all_users', 'all_astrologers', 'specific_users', 'followers']) // ✅ Keep enum
  @IsNotEmpty()
  recipientType: 'all_users' | 'all_astrologers' | 'specific_users' | 'followers'; // ✅ Add union type

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificRecipients?: string[];

  @IsOptional()
  @IsString()
  astrologerId?: string;
}
