// src/admin/features/admin-management/services/admin-management.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';

import { Admin, AdminDocument } from '../../../core/schemas/admin.schema';
import { AdminRole, AdminRoleDocument } from '../../../core/schemas/admin-role.schema';
import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { CreateAdminDto } from '../../auth/dto/create-admin.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';

@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(AdminRole.name) private roleModel: Model<AdminRoleDocument>,
    private activityLogService: AdminActivityLogService,
  ) {}

  /**
   * Get all admins
   */
  async getAllAdmins(page: number = 1, limit: number = 50, status?: string): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) {
      query.status = status;
    }

    const [admins, total] = await Promise.all([
      this.adminModel
        .find(query)
        .populate('roleId')
        .select('-password -twoFactorSecret')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.adminModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        admins,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get admin statistics
   */
  async getAdminStats(): Promise<any> {
    const [total, active, inactive, superAdmins] = await Promise.all([
      this.adminModel.countDocuments(),
      this.adminModel.countDocuments({ status: 'active' }),
      this.adminModel.countDocuments({ status: 'inactive' }),
      this.adminModel.countDocuments({ isSuperAdmin: true }),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        inactive,
        superAdmins,
      },
    };
  }

  /**
   * Get admin details
   */
  async getAdminDetails(adminId: string): Promise<any> {
    const admin = await this.adminModel
      .findById(adminId)
      .populate('roleId')
      .select('-password -twoFactorSecret')
      .lean();

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return {
      success: true,
      data: admin,
    };
  }

  /**
   * Create new admin
   */
  async createAdmin(createDto: CreateAdminDto, createdById: string): Promise<any> {
    // Check if email already exists
    const existing = await this.adminModel.findOne({ email: createDto.email });
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    // Validate role
    const role = await this.roleModel.findOne({ name: createDto.roleType });
    if (!role) {
      throw new BadRequestException(`Invalid role: ${createDto.roleType}`);
    }

    // Generate unique admin ID
    const count = await this.adminModel.countDocuments();
    const adminId = `ADMIN_${String(count + 1).padStart(4, '0')}`;

    // Hash password
    const hashedPassword = await bcrypt.hash(createDto.password, 10);

    // Create admin
    const admin = new this.adminModel({
      adminId,
      name: createDto.name,
      email: createDto.email,
      password: hashedPassword,
      phoneNumber: createDto.phoneNumber,
      roleId: role._id,
      roleType: createDto.roleType,
      department: createDto.department,
      customPermissions: createDto.customPermissions || [],
      status: 'active',
      isSuperAdmin: createDto.roleType === 'super_admin',
      requirePasswordChange: true,
      createdBy: createdById,
      createdAt: new Date(),
    });

    await admin.save();

    // Log admin creation
    await this.activityLogService.log({
      adminId: createdById,
      action: 'admin.created',
      module: 'admins',
      targetId: admin.adminId,
      targetType: 'Admin',
      status: 'success',
      details: {
        newAdminId: admin.adminId,
        email: admin.email,
        roleType: admin.roleType,
      },
    });

    this.logger.log(`New admin created: ${admin.email} by ${createdById}`);

    return {
      success: true,
      message: 'Admin created successfully',
      data: {
        adminId: admin.adminId,
        name: admin.name,
        email: admin.email,
        roleType: admin.roleType,
      },
    };
  }

  /**
   * Update admin
   */
  async updateAdmin(adminId: string, updatedById: string, updateDto: UpdateAdminDto): Promise<any> {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Update fields
    if (updateDto.name) admin.name = updateDto.name;
    if (updateDto.phoneNumber) admin.phoneNumber = updateDto.phoneNumber;
    if (updateDto.department) admin.department = updateDto.department;
    if (updateDto.customPermissions) admin.customPermissions = updateDto.customPermissions;

    await admin.save();

    // Log update
    await this.activityLogService.log({
      adminId: updatedById,
      action: 'admin.updated',
      module: 'admins',
      targetId: adminId,
      targetType: 'Admin',
      status: 'success',
      details: updateDto,
    });

    return {
      success: true,
      message: 'Admin updated successfully',
    };
  }

  /**
   * Update admin status
   */
  async updateAdminStatus(adminId: string, updatedById: string, status: string): Promise<any> {
    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const admin = await this.adminModel.findByIdAndUpdate(
      adminId,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Log status update
    await this.activityLogService.log({
      adminId: updatedById,
      action: 'admin.status_updated',
      module: 'admins',
      targetId: adminId,
      targetType: 'Admin',
      status: 'success',
      details: { newStatus: status },
    });

    return {
      success: true,
      message: `Admin status updated to ${status}`,
    };
  }

  /**
   * Delete admin
   */
  async deleteAdmin(adminId: string, deletedById: string): Promise<any> {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Prevent self-deletion
    if (adminId === deletedById) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Prevent deleting super admins
    if (admin.isSuperAdmin) {
      throw new BadRequestException('Cannot delete super admin accounts');
    }

    await admin.deleteOne();

    // Log deletion
    await this.activityLogService.log({
      adminId: deletedById,
      action: 'admin.deleted',
      module: 'admins',
      targetId: adminId,
      targetType: 'Admin',
      status: 'success',
      details: {
        deletedAdminEmail: admin.email,
      },
    });

    this.logger.log(`Admin deleted: ${admin.email} by ${deletedById}`);

    return {
      success: true,
      message: 'Admin deleted successfully',
    };
  }
}
