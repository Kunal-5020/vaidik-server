import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OnboardingService } from '../services/onboarding.service';
import { RegisterAstrologerDto } from '../dto/register-astrologer.dto';

@Controller('astrologer/onboarding')
export class AstrologerOnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  // Public registration (no auth required)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(ValidationPipe) registerDto: RegisterAstrologerDto) {
    return this.onboardingService.registerAstrologer(registerDto);
  }

  // Get onboarding status (requires auth)
  @Get('status/:astrologerId')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Param('astrologerId') astrologerId: string) {
    return this.onboardingService.getOnboardingStatus(astrologerId);
  }
}
