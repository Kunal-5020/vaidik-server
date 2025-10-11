import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument } from '../schemas/admin.schema';
import { AdminRole, AdminRoleDocument } from '../schemas/admin-role.schema';
import { AdminActivityLogService } from './admin-activity-log.service';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(AdminRole.name) private roleModel: Model<AdminRoleDocument>,
    private jwtService: JwtService,
    private activityLogService: AdminActivityLogService,
  ) {}

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<any> {
    const admin = await this.adminModel
      .findOne({ email })
      .populate('roleId')
      .exec();

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account is locked. Try again in ${minutesLeft} minutes`);
    }

    // Check status
    if (admin.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      admin.failedLoginAttempts += 1;

      if (admin.failedLoginAttempts >= 5) {
        admin.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        admin.status = 'locked';
        await admin.save();

        await this.activityLogService.log({
          adminId: String(admin._id), // ✅ Use String() instead
          action: 'admin.account_locked',
          module: 'auth',
          status: 'warning',
          details: { reason: 'Multiple failed login attempts' },
          ipAddress,
          userAgent,
        });

        throw new UnauthorizedException('Account locked due to multiple failed login attempts');
      }

      await admin.save();
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    admin.failedLoginAttempts = 0;
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = ipAddress;
    admin.lastActivityAt = new Date();
    
if ((admin.status as string) === 'locked') {
  admin.status = 'active';
  admin.lockedUntil = undefined;
}

    
    await admin.save();

    // Generate JWT token
    const token = this.jwtService.sign({
      _id: String(admin._id), // ✅ Use String()
      email: admin.email,
      roleType: admin.roleType,
      isAdmin: true,
      isSuperAdmin: admin.isSuperAdmin,
    });

    // Log activity
    await this.activityLogService.log({
      adminId: String(admin._id), // ✅ Use String()
      action: 'admin.login',
      module: 'auth',
      status: 'success',
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: {
          adminId: admin.adminId,
          name: admin.name,
          email: admin.email,
          roleType: admin.roleType,
          isSuperAdmin: admin.isSuperAdmin,
          requirePasswordChange: admin.requirePasswordChange,
          permissions: (admin.roleId as any)?.permissions || [],
        },
      },
    };
  }

  async createAdmin(
    createData: {
      name: string;
      email: string;
      password: string;
      phoneNumber?: string;
      roleType: string;
      department?: string;
    },
    createdById: string
  ): Promise<any> {
    const existing = await this.adminModel.findOne({ email: createData.email });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const role = await this.roleModel.findOne({ name: createData.roleType });
    if (!role) {
      throw new BadRequestException('Invalid role');
    }

    const count = await this.adminModel.countDocuments();
    const adminId = `ADMIN_${String(count + 1).padStart(4, '0')}`;

    const hashedPassword = await bcrypt.hash(createData.password, 10);

    const admin = new this.adminModel({
      adminId,
      name: createData.name,
      email: createData.email,
      password: hashedPassword,
      phoneNumber: createData.phoneNumber,
      roleId: role._id,
      roleType: createData.roleType,
      department: createData.department,
      status: 'active',
      isSuperAdmin: createData.roleType === 'super_admin',
      requirePasswordChange: true,
      createdBy: createdById,
      createdAt: new Date(),
    });

    await admin.save();

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

  async changePassword(
    adminId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<any> {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    const isValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.passwordChangedAt = new Date();
    admin.requirePasswordChange = false;
    await admin.save();

    await this.activityLogService.log({
      adminId: String(admin._id), // ✅ Use String()
      action: 'admin.password_changed',
      module: 'auth',
      status: 'success',
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  async getProfile(adminId: string): Promise<any> {
    const admin = await this.adminModel
      .findById(adminId)
      .populate('roleId')
      .select('-password')
      .lean();

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    return {
      success: true,
      data: admin,
    };
  }
}
