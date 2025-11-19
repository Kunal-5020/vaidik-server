import {
  IsArray,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Min,
  MinLength,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProductRemedyItemDto {
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

export class SuggestBulkRemediesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one product must be provided' })
  @ValidateNested({ each: true })
  @Type(() => ProductRemedyItemDto)
  products: ProductRemedyItemDto[];
}
