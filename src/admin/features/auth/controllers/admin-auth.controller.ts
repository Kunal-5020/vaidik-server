// src/admin/features/auth/controllers/admin-auth.controller.ts
import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Req, 
  UseGuards, 
  ValidationPipe,
  HttpCode,
  HttpStatus 
} from '@nestjs/common';

import { AdminAuthService } from '../services/admin-auth.service';
import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminLoginDto } from '../dto/admin-login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { IpExtractorUtil } from '../../../../common/utils/ip-extractor.util';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /**
   * POST /admin/auth/login
   * Admin login endpoint
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(ValidationPipe) loginDto: AdminLoginDto,
    @Req() req: any
  ) {
    const ipAddress = IpExtractorUtil.getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    return this.adminAuthService.login(
      loginDto.email,
      loginDto.password,
      ipAddress,
      userAgent
    );
  }

  /**
   * POST /admin/auth/logout
   * Admin logout (optional - for activity logging)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  async logout(@CurrentAdmin() admin: any) {
    return this.adminAuthService.logout(admin._id);
  }

  /**
   * GET /admin/auth/profile
   * Get current admin profile
   */
  @Get('profile')
  @UseGuards(AdminAuthGuard)
  async getProfile(@CurrentAdmin() admin: any) {
    return this.adminAuthService.getProfile(admin._id);
  }

  /**
   * POST /admin/auth/change-password
   * Change admin password
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
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

  /**
   * POST /admin/auth/create-admin
   * Create new admin user (Super Admin only)
   */
  @Post('create-admin')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.ADMINS_CREATE)
  async createAdmin(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) createDto: CreateAdminDto
  ) {
    return this.adminAuthService.createAdmin(createDto, admin._id);
  }

  /**
   * GET /admin/auth/verify-token
   * Verify JWT token validity (for frontend)
   */
  @Get('verify-token')
  @UseGuards(AdminAuthGuard)
  async verifyToken(@CurrentAdmin() admin: any) {
    return {
      success: true,
      message: 'Token is valid',
      data: {
        adminId: admin.adminId,
        email: admin.email,
        roleType: admin.roleType,
      },
    };
  }

  /**
   * POST /admin/auth/refresh-token
   * Refresh JWT token (optional - for token refresh strategy)
   */
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  async refreshToken(@CurrentAdmin() admin: any) {
    return this.adminAuthService.refreshToken(admin._id);
  }
}
