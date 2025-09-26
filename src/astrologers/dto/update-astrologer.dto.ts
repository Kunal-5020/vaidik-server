import { 
  IsOptional, 
  IsString, 
  IsArray, 
  IsNumber, 
  IsBoolean,
  Min,
  Max,
  Length
} from 'class-validator';

export class UpdateAstrologerDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(10, 500, { message: 'Bio must be between 10 and 500 characters' })
  bio?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Experience years must be a number' })
  @Min(0, { message: 'Experience years cannot be negative' })
  @Max(50, { message: 'Experience years cannot exceed 50' })
  experienceYears?: number;

  @IsOptional()
  @IsArray({ message: 'Specializations must be an array' })
  @IsString({ each: true, message: 'Each specialization must be a string' })
  specializations?: string[];

  @IsOptional()
  @IsArray({ message: 'Languages must be an array' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languages?: string[];

  @IsOptional()
  @IsNumber({}, { message: 'Chat pricing must be a number' })
  @Min(5, { message: 'Chat pricing must be at least ₹5 per minute' })
  @Max(1000, { message: 'Chat pricing cannot exceed ₹1000 per minute' })
  chatPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Call pricing must be a number' })
  @Min(5, { message: 'Call pricing must be at least ₹5 per minute' })
  @Max(1000, { message: 'Call pricing cannot exceed ₹1000 per minute' })
  callPrice?: number;

  @IsOptional()
  @IsBoolean({ message: 'Chat enabled must be a boolean' })
  isChatEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Call enabled must be a boolean' })
  isCallEnabled?: boolean;
}
