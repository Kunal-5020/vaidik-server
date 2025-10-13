// src/admin/controllers/admin-management.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { Permissions } from '../constants/permissions';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../schemas/admin.schema';

@Controller('admin/admins')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminManagementController {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>
  ) {}

  @Get()
  @RequirePermissions(Permissions.ADMINS_VIEW)
  async getAllAdmins() {
    const admins = await this.adminModel
      .find()
      .select('-password -twoFactorSecret')
      .populate('roleId')
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: { admins }
    };
  }
}
