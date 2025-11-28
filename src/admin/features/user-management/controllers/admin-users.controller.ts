// src/admin/features/user-management/controllers/admin-users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
  Delete,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminUsersService } from '../services/admin-users.service';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserQueryDto } from '../dto/user-query.dto';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  /**
   * GET /admin/users
   * Get all users with filters and pagination
   */
  @Get()
  @RequirePermissions(Permissions.USERS_VIEW)
  async getAllUsers(
    @Query(ValidationPipe) queryDto: UserQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = {
      status: queryDto.status,
      search: queryDto.search,
      registrationMethod: queryDto.registrationMethod,
      isPhoneVerified: queryDto.isPhoneVerified,
      startDate: queryDto.startDate ? new Date(queryDto.startDate) : undefined,
      endDate: queryDto.endDate ? new Date(queryDto.endDate) : undefined,
    };

    return this.adminUsersService.getAllUsers(page, limit, filters);
  }

  /**
   * GET /admin/users/stats
   * Get user statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminUsersService.getUserStats(startDate, endDate);
  }

  /**
   * GET /admin/users/active-now
   * Get currently active users count
   */
  @Get('active-now')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getActiveUsers() {
    return this.adminUsersService.getActiveUsers();
  }

  /**
   * GET /admin/users/search
   * Search users by name, email, or phone
   */
  @Get('search')
  @RequirePermissions(Permissions.USERS_VIEW)
  async searchUsers(
    @Query('query') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminUsersService.searchUsers(query, page, limit);
  }

  /**
   * GET /admin/users/:userId
   * Get single user details
   */
  @Get(':userId')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserDetails(@Param('userId') userId: string) {
    return this.adminUsersService.getUserDetails(userId);
  }

  /**
   * GET /admin/users/:userId/activity
   * Get user activity summary
   */
  @Get(':userId/activity')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserActivity(@Param('userId') userId: string) {
    return this.adminUsersService.getUserActivity(userId);
  }

  /**
   * GET /admin/users/:userId/transactions
   * Get user wallet transactions
   */
  @Get(':userId/transactions')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserTransactions(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminUsersService.getUserTransactions(userId, page, limit);
  }

  /**
   * GET /admin/users/:userId/orders
   * Get user orders
   */
  @Get(':userId/orders')
  @RequirePermissions(Permissions.USERS_VIEW)
  async getUserOrders(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminUsersService.getUserOrders(userId, page, limit);
  }

  /**
   * PATCH /admin/users/:userId/status
   * Update user status (block/unblock/suspend)
   */
  @Patch(':userId/status')
  @RequirePermissions(Permissions.USERS_BLOCK)
  async updateUserStatus(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) statusDto: UpdateUserStatusDto,
  ) {
    return this.adminUsersService.updateUserStatus(
      userId,
      admin._id,
      statusDto.status,
      statusDto.reason,
    );
  }

  /**
   * PATCH /admin/users/:userId/wallet/adjust
   * Adjust user wallet balance (admin credit/debit)
   */
  @Patch(':userId/wallet/adjust')
  @RequirePermissions(Permissions.USERS_EDIT)
  async adjustWalletBalance(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: any,
    @Body('amount', ParseIntPipe) amount: number,
    @Body('reason') reason: string,
  ) {
    return this.adminUsersService.adjustWalletBalance(userId, admin._id, amount, reason);
  }

  /**
   * DELETE /admin/users/:userId
   * Soft delete user account
   */
  @Delete(':userId')
  @RequirePermissions(Permissions.USERS_DELETE)
  async deleteUser(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason?: string,
  ) {
    return this.adminUsersService.deleteUser(userId, admin._id, reason);
  }

  /**
   * POST /admin/users/:userId/restore
   * Restore soft-deleted user
   */
  @Patch(':userId/restore')
  @RequirePermissions(Permissions.USERS_EDIT)
  async restoreUser(
    @Param('userId') userId: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.restoreUser(userId, admin._id);
  }

  /**
   * GET /admin/users/export/csv
   * Export users to CSV
   */
  @Get('export/csv')
  @RequirePermissions(Permissions.USERS_EXPORT)
  async exportUsersCSV(
    @Query('status') status?: string,
  ) {
    return this.adminUsersService.exportUsersToCSV(status);
  }
}
