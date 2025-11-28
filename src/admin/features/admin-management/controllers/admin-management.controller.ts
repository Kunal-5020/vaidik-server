// src/admin/features/admin-management/controllers/admin-management.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminManagementService } from '../services/admin-management.service';
import { CreateAdminDto } from '../../auth/dto/create-admin.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';

@Controller('admin/admins')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminManagementController {
  constructor(private adminManagementService: AdminManagementService) {}

  /**
   * GET /admin/admins
   * Get all admins
   */
  @Get()
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getAllAdmins(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.adminManagementService.getAllAdmins(page, limit, status);
  }

  /**
   * GET /admin/admins/stats
   * Get admin statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getAdminStats() {
    return this.adminManagementService.getAdminStats();
  }

  /**
   * GET /admin/admins/:adminId
   * Get admin details
   */
  @Get(':adminId')
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getAdminDetails(@Param('adminId') adminId: string) {
    return this.adminManagementService.getAdminDetails(adminId);
  }

  /**
   * POST /admin/admins
   * Create new admin
   */
  @Post()
  @RequirePermissions(Permissions.ADMINS_CREATE)
  async createAdmin(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) createDto: CreateAdminDto,
  ) {
    return this.adminManagementService.createAdmin(createDto, admin._id);
  }

  /**
   * PATCH /admin/admins/:adminId
   * Update admin details
   */
  @Patch(':adminId')
  @RequirePermissions(Permissions.ADMINS_EDIT)
  async updateAdmin(
    @Param('adminId') adminId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) updateDto: UpdateAdminDto,
  ) {
    return this.adminManagementService.updateAdmin(adminId, admin._id, updateDto);
  }

  /**
   * PATCH /admin/admins/:adminId/status
   * Update admin status
   */
  @Patch(':adminId/status')
  @RequirePermissions(Permissions.ADMINS_EDIT)
  async updateAdminStatus(
    @Param('adminId') adminId: string,
    @CurrentAdmin() admin: any,
    @Body('status') status: string,
  ) {
    return this.adminManagementService.updateAdminStatus(adminId, admin._id, status);
  }

  /**
   * DELETE /admin/admins/:adminId
   * Delete admin
   */
  @Delete(':adminId')
  @RequirePermissions(Permissions.ADMINS_DELETE)
  async deleteAdmin(
    @Param('adminId') adminId: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminManagementService.deleteAdmin(adminId, admin._id);
  }
}
