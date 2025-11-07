import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class SearchProductsDto {
  @IsString()
  @IsNotEmpty()
  query: string; // Product name to search

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class SearchProductsResponseDto {
  success: boolean;
  data: {
    query: string;
    results: Array<{
      productId: number;
      variantId: number;
      productName: string;
      productHandle: string;
      price: string;
      imageUrl: string;
      sku: string | null;
      description: string;
      type: string; // gemstone, mantra, etc.
      tags: string;
    }>;
    count: number;
  };
}
