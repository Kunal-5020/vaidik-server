import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ===== PROFILE =====

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getUserProfile(req.user._id);
  }

  @Patch('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateProfileDto: UpdateProfileDto
  ) {
    return this.usersService.updateProfile(req.user._id, updateProfileDto);
  }

  // ===== PREFERENCES =====

  @Get('preferences')
  async getPreferences(@Req() req: AuthenticatedRequest) {
    return this.usersService.getPreferences(req.user._id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdatePreferencesDto
  ) {
    return this.usersService.updatePreferences(req.user._id, updateDto);
  }

  // ===== WALLET =====

  @Get('wallet')
  async getWallet(@Req() req: AuthenticatedRequest) {
    return this.usersService.getWallet(req.user._id);
  }

  // ===== FAVORITES =====

  @Get('favorites')
  async getFavorites(@Req() req: AuthenticatedRequest) {
    return this.usersService.getFavoriteAstrologers(req.user._id);
  }

  @Post('favorites/:astrologerId')
  async addFavorite(
    @Param('astrologerId') astrologerId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.usersService.addFavorite(req.user._id, astrologerId);
  }

  @Delete('favorites/:astrologerId')
  async removeFavorite(
    @Param('astrologerId') astrologerId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.usersService.removeFavorite(req.user._id, astrologerId);
  }

  // ===== STATISTICS =====

  @Get('statistics')
  async getStatistics(@Req() req: AuthenticatedRequest) {
    return this.usersService.getUserStatistics(req.user._id);
  }

  // ===== ACCOUNT =====

  @Delete('account')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    return this.usersService.deleteAccount(req.user._id);
  }
}
