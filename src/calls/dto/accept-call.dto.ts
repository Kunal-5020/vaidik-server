// ✅ ADD: src/calls/dto/accept-call.dto.ts
import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class AcceptCallDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsMongoId()
  receiverId: string;
}