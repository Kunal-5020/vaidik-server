// src/admin/services/admin-auth.service.ts 
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument } from '../schemas/admin.schema';
import { AdminRole } from '../enums/admin-role.enum';
import { getRolePermissions } from '../config/admin-permissions.config';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export interface CreateAdminDto {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
  phone?: string;
  createdBy: string;
}

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: AdminRole;
  permissions: string[];
}

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: AdminLoginDto) {
    const { email, password } = loginDto;
    
    const admin = await this.adminModel.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    });

    if (!admin || !await bcrypt.compare(password, admin.password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.adminModel.findByIdAndUpdate(admin._id, {
      lastLoginAt: new Date()
    });

    const permissions = getRolePermissions(admin.role);
    
    const payload: AdminJwtPayload = {
      adminId: (admin._id as string).toString(), // Fix: Cast _id
      email: admin.email,
      role: admin.role,
      permissions: [...permissions, ...admin.permissions],
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '8h' });
    const refreshToken = this.jwtService.sign(
      { adminId: admin._id }, 
      { expiresIn: '7d' }
    );

    return {
      success: true,
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          permissions: payload.permissions,
          lastLoginAt: admin.lastLoginAt,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    };
  }

  async validateToken(token: string): Promise<AdminDocument> {
    try {
      const payload = this.jwtService.verify(token) as AdminJwtPayload;
      const admin = await this.adminModel.findById(payload.adminId);
      
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin not found or inactive');
      }

      return admin;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const admin = await this.adminModel.findById(payload.adminId);

      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin not found');
      }

      const permissions = getRolePermissions(admin.role);
      const newPayload: AdminJwtPayload = {
        adminId: (admin._id as string).toString(), // Fix: Cast _id
        email: admin.email,
        role: admin.role,
        permissions: [...permissions, ...admin.permissions],
      };

      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '8h' });

      return {
        success: true,
        data: { accessToken },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
