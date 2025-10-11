import { Controller, Get, Patch, Param, Query, Body, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { Permissions } from '../constants/permissions';
import { AdminUsersService } from '../services/admin-users.service';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions(Permissions.USERS_VIEW)
  async getAllUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    return this.adminUsersService.getAllUsers(page, limit, { status, search });
  }

  @Get('stats')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserStats() {
    return this.adminUsersService.getUserStats();
  }

  @Get(':userId')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserDetails(@Param('userId') userId: string) {
    return this.adminUsersService.getUserDetails(userId);
  }

  @Patch(':userId/status')
  @RequirePermissions(Permissions.USERS_BLOCK)
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body('status') status: string
  ) {
    return this.adminUsersService.updateUserStatus(userId, status);
  }
}
