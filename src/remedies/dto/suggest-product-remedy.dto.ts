import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Min,
  MinLength,
  IsEnum,
} from 'class-validator';

export class SuggestProductRemedyDto {
  @IsNumber()
  @IsNotEmpty({ message: 'Product ID is required' })
  @Min(1)
  shopifyProductId: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  shopifyVariantId?: number;

  @IsString({ message: 'Recommendation reason must be a string' })
  @IsNotEmpty({ message: 'Recommendation reason is required' })
  @MinLength(10)
  recommendationReason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  usageInstructions?: string;

  @IsOptional()
  @IsEnum(['call', 'chat'])
  suggestedInChannel?: 'call' | 'chat';
}
