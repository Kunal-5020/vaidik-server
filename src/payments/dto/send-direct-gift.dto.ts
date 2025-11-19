import { IsMongoId, IsNotEmpty, IsNumber, IsString, Min, MaxLength, IsOptional } from 'class-validator';

export class SendDirectGiftDto {
  @IsMongoId({ message: 'Invalid astrologer ID' })
  astrologerId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  giftType: string;

  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(10, { message: 'Minimum gift amount is ₹10' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

