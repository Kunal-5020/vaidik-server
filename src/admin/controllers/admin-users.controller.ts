// src/admin/controllers/admin-users.controller.ts (Updated for consistency)
import { 
  Controller, 
  Get, 
  Patch, 
  Delete,
  Param, 
  Body, 
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  ValidationPipe
} from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminPermission } from '../enums/admin-role.enum';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminDocument } from '../schemas/admin.schema';
import { AdminUsersService } from '../services/admin-users.service';
import type { GetUsersQueryDto } from '../dto/user/get-users-query.dto';
import type { SuspendUserDto } from '../dto/user/suspend-user.dto';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions(AdminPermission.VIEW_USERS)
  async getUsers(
    @Query(ValidationPipe) query: GetUsersQueryDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    // Fix: Provide defaults for required service parameters
    const serviceQuery = {
      page: query.page || 1,
      limit: query.limit || 20,
      search: query.search,
      status: query.status,
    };

    return {
      success: true,
      data: await this.adminUsersService.getUsers(serviceQuery),
    };
  }

  @Get(':userId')
  @RequirePermissions(AdminPermission.VIEW_USERS)
  async getUser(@Param('userId') userId: string) {
    return {
      success: true,
      data: await this.adminUsersService.getUser(userId),
    };
  }

  @Patch(':userId/suspend')
  @RequirePermissions(AdminPermission.SUSPEND_USERS)
  async suspendUser(
    @Param('userId') userId: string,
    @Body(ValidationPipe) suspendDto: SuspendUserDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminUsersService.suspendUser(
        userId, 
        suspendDto.reason, 
        (admin._id as string).toString()
      ),
      message: 'User suspended successfully',
    };
  }

  @Patch(':userId/activate')
  @RequirePermissions(AdminPermission.SUSPEND_USERS)
  async activateUser(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminUsersService.activateUser(
        userId, 
        (admin._id as string).toString()
      ),
      message: 'User activated successfully',
    };
  }

  @Delete(':userId')
  @RequirePermissions(AdminPermission.MANAGE_USERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    await this.adminUsersService.deleteUser(
      userId, 
      (admin._id as string).toString()
    );
  }

  @Get(':userId/transactions')
  @RequirePermissions(AdminPermission.VIEW_TRANSACTIONS)
  async getUserTransactions(@Param('userId') userId: string) {
    return {
      success: true,
      data: await this.adminUsersService.getUserTransactions(userId),
    };
  }
}
