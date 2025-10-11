import {
  IsArray,
  IsEnum,
  IsString,
  IsBoolean,
  ValidateNested,
  ArrayMinSize,
  Matches
} from 'class-validator';
import { Type } from 'class-transformer';

class TimeSlot {
  @IsString({ message: 'Start time must be a string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Start time must be in HH:MM format' })
  start: string;

  @IsString({ message: 'End time must be a string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'End time must be in HH:MM format' })
  end: string;

  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive: boolean;
}

class DaySchedule {
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], {
    message: 'Invalid day of week'
  })
  day: string;

  @IsArray({ message: 'Slots must be an array' })
  @ValidateNested({ each: true })
  @Type(() => TimeSlot)
  slots: TimeSlot[];
}

export class UpdateWorkingHoursDto {
  @IsArray({ message: 'Working hours must be an array' })
  @ArrayMinSize(1, { message: 'At least one day schedule is required' })
  @ValidateNested({ each: true })
  @Type(() => DaySchedule)
  workingHours: DaySchedule[];
}
