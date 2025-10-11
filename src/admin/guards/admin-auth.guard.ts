import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../schemas/admin.schema';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Check if user is admin
      if (!payload.isAdmin) {
        throw new UnauthorizedException('Access denied: Admin only');
      }

      // Fetch full admin details including role and permissions
      const admin = await this.adminModel
        .findById(payload._id)
        .populate('roleId')
        .lean();

      if (!admin) {
        throw new UnauthorizedException('Admin not found');
      }

      if (admin.status !== 'active') {
        throw new UnauthorizedException('Admin account is not active');
      }

      // Check if account is locked
      if (admin.lockedUntil && admin.lockedUntil > new Date()) {
        throw new UnauthorizedException('Account is temporarily locked');
      }

      // Attach admin to request
      request.admin = admin;
      
      // Update last activity
      this.adminModel
        .findByIdAndUpdate(admin._id, { lastActivityAt: new Date() })
        .exec()
        .catch(err => console.error('Failed to update last activity:', err));

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
