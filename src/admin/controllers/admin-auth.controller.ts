import { Controller, Post, Get, Body, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Permissions } from '../constants/permissions';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private adminAuthService: AdminAuthService) {}

  @Post('login')
  async login(
    @Body(ValidationPipe) loginDto: AdminLoginDto,
    @Req() req: any
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    
    return this.adminAuthService.login(
      loginDto.email,
      loginDto.password,
      ipAddress,
      userAgent
    );
  }

  @Get('profile')
  @UseGuards(AdminAuthGuard)
  async getProfile(@CurrentAdmin() admin: any) {
    return this.adminAuthService.getProfile(admin._id);
  }

  @Post('change-password')
  @UseGuards(AdminAuthGuard)
  async changePassword(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto
  ) {
    return this.adminAuthService.changePassword(
      admin._id,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword
    );
  }

  @Post('create-admin')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.ADMINS_CREATE)
  async createAdmin(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) createDto: CreateAdminDto
  ) {
    return this.adminAuthService.createAdmin(createDto, admin._id);
  }
}
