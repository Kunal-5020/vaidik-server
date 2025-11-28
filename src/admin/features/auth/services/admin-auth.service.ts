// src/admin/features/auth/services/admin-auth.service.ts
import { 
  Injectable, 
  UnauthorizedException, 
  ConflictException, 
  BadRequestException,
  Logger 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { Admin, AdminDocument } from '../../../core/schemas/admin.schema';
import { AdminRole, AdminRoleDocument } from '../../../core/schemas/admin-role.schema';
import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { AuthResponse } from '../interfaces/auth-response.interface';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(AdminRole.name) private roleModel: Model<AdminRoleDocument>,
    private jwtService: JwtService,
    private activityLogService: AdminActivityLogService,
  ) {}

  /**
   * Admin Login
   */
  async login(
    email: string, 
    password: string, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<AuthResponse> {
    // Find admin by email
    const admin = await this.adminModel
      .findOne({ email })
      .populate('roleId')
      .exec();

    if (!admin) {
      this.logger.warn(`Login attempt failed: Admin not found - ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
      this.logger.warn(`Login attempt on locked account: ${email}`);
      throw new UnauthorizedException(
        `Account is locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`
      );
    }

    // Check account status
    if (admin.status !== 'active') {
      this.logger.warn(`Login attempt on ${admin.status} account: ${email}`);
      throw new UnauthorizedException(`Account is ${admin.status}`);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      admin.failedLoginAttempts += 1;

      // Lock account after 5 failed attempts
      if (admin.failedLoginAttempts >= 5) {
        admin.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        admin.status = 'locked';
        await admin.save();

        // Log the lock event
        await this.activityLogService.log({
          adminId: String(admin._id),
          action: 'admin.account_locked',
          module: 'auth',
          status: 'warning',
          details: { reason: 'Multiple failed login attempts', attempts: admin.failedLoginAttempts },
          ipAddress,
          userAgent,
        });

        this.logger.warn(`Account locked due to multiple failed attempts: ${email}`);
        throw new UnauthorizedException('Account locked due to multiple failed login attempts');
      }

      await admin.save();
      this.logger.warn(`Failed login attempt ${admin.failedLoginAttempts}/5: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login - Reset failed attempts
    admin.failedLoginAttempts = 0;
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = ipAddress;
    admin.lastActivityAt = new Date();
    
    // Unlock account if it was locked
    if (admin.lockedUntil && admin.lockedUntil < new Date()) {
        // Unlock if lock period has passed
        admin.status = 'active';
        admin.lockedUntil = undefined;
    }
    
    await admin.save();

    // Generate JWT token
    const token = this.generateToken(admin);

    // Log successful login
    await this.activityLogService.log({
      adminId: String(admin._id),
      action: 'admin.login',
      module: 'auth',
      status: 'success',
      ipAddress,
      userAgent,
    });

    this.logger.log(`Successful login: ${email}`);

    // Return response
    return {
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: this.sanitizeAdminData(admin),
      },
    };
  }

  /**
   * Admin Logout (for activity logging)
   */
  async logout(adminId: string): Promise<{ success: boolean; message: string }> {
    await this.activityLogService.log({
      adminId,
      action: 'admin.logout',
      module: 'auth',
      status: 'success',
    });

    this.logger.log(`Admin logged out: ${adminId}`);

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Get Admin Profile
   */
  async getProfile(adminId: string): Promise<any> {
    const admin = await this.adminModel
      .findById(adminId)
      .populate('roleId')
      .select('-password -twoFactorSecret')
      .lean();

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    return {
      success: true,
      data: admin,
    };
  }

  /**
   * Change Password
   */
  async changePassword(
    adminId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const admin = await this.adminModel.findById(adminId);
    
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isValid) {
      this.logger.warn(`Invalid old password attempt for admin: ${adminId}`);
      throw new UnauthorizedException('Invalid current password');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    // Hash and save new password
    admin.password = await bcrypt.hash(newPassword, 10);
    admin.passwordChangedAt = new Date();
    admin.requirePasswordChange = false;
    await admin.save();

    // Log password change
    await this.activityLogService.log({
      adminId: String(admin._id),
      action: 'admin.password_changed',
      module: 'auth',
      status: 'success',
    });

    this.logger.log(`Password changed successfully for admin: ${adminId}`);

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * Create New Admin
   */
  async createAdmin(createDto: CreateAdminDto, createdById: string): Promise<any> {
    // Check if email already exists
    const existing = await this.adminModel.findOne({ email: createDto.email });
    if (existing) {
      throw new ConflictException('Email already exists');
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
      data: this.sanitizeAdminData(admin),
    };
  }

  /**
   * Refresh Token
   */
  async refreshToken(adminId: string): Promise<AuthResponse> {
    const admin = await this.adminModel
      .findById(adminId)
      .populate('roleId')
      .exec();

    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('Invalid admin');
    }

    // Update last activity
    admin.lastActivityAt = new Date();
    await admin.save();

    // Generate new token
    const token = this.generateToken(admin);

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token,
        admin: this.sanitizeAdminData(admin),
      },
    };
  }

  /**
   * Generate JWT Token
   */
  private generateToken(admin: AdminDocument): string {
    const payload = {
      _id: String(admin._id),
      email: admin.email,
      roleType: admin.roleType,
      isAdmin: true,
      isSuperAdmin: admin.isSuperAdmin,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Sanitize Admin Data (remove sensitive fields)
   */
  private sanitizeAdminData(admin: AdminDocument): any {
    return {
      adminId: admin.adminId,
      name: admin.name,
      email: admin.email,
      phoneNumber: admin.phoneNumber,
      roleType: admin.roleType,
      isSuperAdmin: admin.isSuperAdmin,
      requirePasswordChange: admin.requirePasswordChange,
      permissions: (admin.roleId as any)?.permissions || [],
      customPermissions: admin.customPermissions || [],
      deniedPermissions: admin.deniedPermissions || [],
      department: admin.department,
      status: admin.status,
      lastLoginAt: admin.lastLoginAt,
    };
  }
}
