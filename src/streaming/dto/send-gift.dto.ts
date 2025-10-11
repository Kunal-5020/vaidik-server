import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsEnum
} from 'class-validator';

export class SendGiftDto {
  @IsString({ message: 'Stream ID must be a string' })
  @IsNotEmpty({ message: 'Stream ID is required' })
  streamId: string;

  @IsEnum(['rose', 'heart', 'diamond', 'crown', 'trophy'], {
    message: 'Invalid gift type'
  })
  giftType: string;

  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(10, { message: 'Minimum gift amount is ₹10' })
  amount: number;
}
