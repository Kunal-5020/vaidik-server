// src/orders/dto/extend-session.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class ExtendSessionDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
