import {
  IsArray,
  IsString,
  IsNotEmpty,
  ValidateNested,
  ArrayMinSize,
  MinLength,
  MaxLength
} from 'class-validator';
import { Type } from 'class-transformer';

class ProfileChange {
  @IsString({ message: 'Field name must be a string' })
  @IsNotEmpty({ message: 'Field name is required' })
  field: string;

  @IsNotEmpty({ message: 'Current value is required' })
  currentValue: any;

  @IsNotEmpty({ message: 'Requested value is required' })
  requestedValue: any;

  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Reason for change is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}

export class RequestProfileChangeDto {
  @IsArray({ message: 'Changes must be an array' })
  @ArrayMinSize(1, { message: 'At least one change is required' })
  @ValidateNested({ each: true })
  @Type(() => ProfileChange)
  changes: ProfileChange[];
}
