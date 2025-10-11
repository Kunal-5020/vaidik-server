import { 
  IsOptional, 
  IsEnum, 
  IsArray,
  ValidateNested,
  IsString,
  IsBoolean
} from 'class-validator';
import { Type } from 'class-transformer';

class WorkingHoursDto {
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  day: string;

  @IsString()
  startTime: string; // HH:MM format

  @IsString()
  endTime: string; // HH:MM format

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateAvailabilityDto {
  @IsOptional()
  @IsEnum(['online', 'offline', 'busy'], {
    message: 'Status must be online, offline, or busy'
  })
  status?: string;

  @IsOptional()
  @IsArray({ message: 'Working hours must be an array' })
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto[];
}
