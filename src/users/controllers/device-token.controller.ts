import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DeviceTokenService } from '../services/device-token.service';
import { RegisterDeviceTokenDto } from '../dto/register-device-token.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokenController {
  constructor(private deviceTokenService: DeviceTokenService) {}

  @Post()
  async registerToken(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) registerDto: RegisterDeviceTokenDto
  ) {
    return this.deviceTokenService.addDeviceToken(
      req.user._id,
      registerDto.token,
      registerDto.deviceId
    );
  }

  @Delete()
  async removeToken(
    @Req() req: AuthenticatedRequest,
    @Body('token') token: string
  ) {
    return this.deviceTokenService.removeDeviceToken(req.user._id, token);
  }
}
