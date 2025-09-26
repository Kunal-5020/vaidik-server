// src/admin/controllers/admin-management.controller.ts (Fixed)
import { 
  Controller, 
  Get, 
  Post, 
  Patch,
  Param, 
  Body, 
  Query,
  UseGuards 
} from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { RequireRoles } from '../decorators/roles.decorator';
import { AdminPermission, AdminRole } from '../enums/admin-role.enum';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminDocument } from '../schemas/admin.schema'; // Fix: import type
import { AdminManagementService } from '../services/admin-management.service';
import type { CreateAdminDto } from '../dto/auth/create-admin.dto';
import type { UpdateAdminPermissionsDto } from '../dto/admin/update-admin-permissions.dto';

@Controller('admin/management')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminManagementController {
  constructor(private adminManagementService: AdminManagementService) {}

  @Get('admins')
  @RequirePermissions(AdminPermission.MANAGE_ADMINS)
  async getAllAdmins(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return {
      success: true,
      data: await this.adminManagementService.getAllAdmins({
        page: Number(page),
        limit: Number(limit),
      }),
    };
  }

  @Post('create-admin')
  @RequireRoles(AdminRole.SUPER_ADMIN)
  async createAdmin(
    @Body() createAdminDto: CreateAdminDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return this.adminManagementService.createAdmin({
      ...createAdminDto,
      createdBy: (admin._id as string).toString(), // Fix: Cast _id
    });
  }

  @Patch(':adminId/permissions')
  @RequireRoles(AdminRole.SUPER_ADMIN)
  async updatePermissions(
    @Param('adminId') adminId: string,
    @Body() updateDto: UpdateAdminPermissionsDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminManagementService.updatePermissions(
        adminId, 
        updateDto.permissions, 
        (admin._id as string).toString() // Fix: Cast _id
      ),
      message: 'Permissions updated successfully',
    };
  }

  @Patch(':adminId/deactivate')
  @RequireRoles(AdminRole.SUPER_ADMIN)
  async deactivateAdmin(
    @Param('adminId') adminId: string,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminManagementService.deactivateAdmin(
        adminId, 
        (admin._id as string).toString() // Fix: Cast _id
      ),
      message: 'Admin deactivated successfully',
    };
  }
}
