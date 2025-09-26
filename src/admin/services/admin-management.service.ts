// src/admin/services/admin-management.service.ts (New Service)
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument } from '../schemas/admin.schema';
import { AdminRole, AdminPermission } from '../enums/admin-role.enum';
import { getRolePermissions } from '../config/admin-permissions.config';
import type { CreateAdminDto } from '../dto/auth/create-admin.dto';

interface GetAdminsQuery {
  page: number;
  limit: number;
}

@Injectable()
export class AdminManagementService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {}

  async getAllAdmins(query: GetAdminsQuery) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [admins, total] = await Promise.all([
      this.adminModel
        .find({ isActive: true })
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.adminModel.countDocuments({ isActive: true }),
    ]);

    return {
      admins,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async createAdmin(createAdminDto: CreateAdminDto & { createdBy: string }) {
    const { email, password, name, role, phone, createdBy } = createAdminDto;

    // Check if admin exists
    const existingAdmin = await this.adminModel.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingAdmin) {
      throw new ConflictException('Admin with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin
    const admin = new this.adminModel({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role,
      phone,
      createdBy,
      permissions: [], // Additional permissions beyond role
    });

    await admin.save();

    return {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    };
  }

  async updatePermissions(adminId: string, permissions: AdminPermission[], updatedBy: string) {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    await this.adminModel.findByIdAndUpdate(adminId, {
      permissions,
      updatedAt: new Date(),
    });

    return { message: 'Permissions updated successfully' };
  }

  async deactivateAdmin(adminId: string, deactivatedBy: string) {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    await this.adminModel.findByIdAndUpdate(adminId, {
      isActive: false,
      updatedAt: new Date(),
    });

    return { message: 'Admin deactivated successfully' };
  }
}
