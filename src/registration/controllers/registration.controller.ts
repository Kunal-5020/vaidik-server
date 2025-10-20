import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { RegistrationService } from '../services/registration.service';
import { RegisterDto } from '../dto/register.dto';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

@Controller('registration')
export class RegistrationController {
  constructor(private registrationService: RegistrationService) {}

  // ========== OTP ENDPOINTS (NEW) ==========

  /**
   * PUBLIC: Send OTP to phone number
   * POST /registration/otp/send
   */
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOTP(@Body(ValidationPipe) sendOtpDto: SendOtpDto) {
    return this.registrationService.sendOTP(sendOtpDto);
  }

  /**
   * PUBLIC: Verify OTP
   * POST /registration/otp/verify
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOTP(@Body(ValidationPipe) verifyOtpDto: VerifyOtpDto) {
    return this.registrationService.verifyOTP(verifyOtpDto);
  }

  // ========== REGISTRATION ENDPOINTS ==========

  /**
   * PUBLIC: Register as astrologer candidate
   * POST /registration/register
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.registrationService.register(registerDto);
  }

  // ========== STATUS CHECK ENDPOINTS ==========

  /**
   * PUBLIC: Check registration status by ticket number
   * GET /registration/status/ticket/:ticketNumber
   */
  @Get('status/ticket/:ticketNumber')
  @HttpCode(HttpStatus.OK)
  async getStatusByTicket(@Param('ticketNumber') ticketNumber: string) {
    return this.registrationService.getStatusByTicket(ticketNumber);
  }

  /**
   * PUBLIC: Check registration status by phone number
   * GET /registration/status/phone?phoneNumber=9876543210&countryCode=91
   */
  @Get('status/phone')
  @HttpCode(HttpStatus.OK)
  async getStatusByPhone(
    @Query('phoneNumber') phoneNumber: string,
    @Query('countryCode') countryCode: string = '91'
  ) {
    return this.registrationService.getStatusByPhone(phoneNumber, countryCode);
  }
}
