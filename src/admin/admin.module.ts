// src/admin/admin.module.ts (Updated with all controllers and services)
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

// Controllers
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminAstrologersController } from './controllers/admin-astrologers.controller';
import { AdminManagementController } from './controllers/admin-management.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';

// Services
import { AdminAuthService } from './services/admin-auth.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminAstrologersService } from './services/admin-astrologers.service';
import { AdminManagementService } from './services/admin-management.service';
import { AdminPaymentsService } from './services/admin-payments.service';

// Guards
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';

// Schemas
import { Admin, AdminSchema } from './schemas/admin.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';
import { CallSession, CallSessionSchema } from '../calls/schemas/call-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: CallSession.name, schema: CallSessionSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-jwt-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminUsersController,
    AdminAstrologersController,
    AdminManagementController,
    AdminPaymentsController,
  ],
  providers: [
    AdminAuthService,
    AdminAnalyticsService,
    AdminUsersService,
    AdminAstrologersService,
    AdminManagementService,
    AdminPaymentsService,
    AdminAuthGuard,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [AdminAnalyticsService, AdminAuthService],
})
export class AdminModule {}
