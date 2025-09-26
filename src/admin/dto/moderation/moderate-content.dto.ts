// src/admin/dto/moderation/moderate-content.dto.ts
import { IsEnum, IsString, IsOptional, IsMongoId, MinLength, MaxLength } from 'class-validator';

export enum ModerationAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  FLAG = 'flag',
  REMOVE = 'remove',
}

export class ModerateContentDto {
  @IsMongoId({ message: 'Invalid content ID format' })
  contentId: string;

  @IsEnum(ModerationAction, { message: 'Invalid moderation action' })
  action: ModerationAction;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MinLength(5, { message: 'Reason must be at least 5 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}
