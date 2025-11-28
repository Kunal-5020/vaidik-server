// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Core Schemas
import { Admin, AdminSchema } from './core/schemas/admin.schema';
import { AdminRole, AdminRoleSchema } from './core/schemas/admin-role.schema';

// Core Guards & Providers
import { AdminAuthGuard } from './core/guards/admin-auth.guard';
import { PermissionsGuard } from './core/guards/permissions.guard';

// Feature Modules
import { AuthModule } from './features/auth/auth.module';
import { ActivityLogsModule } from './features/activity-logs/activity-logs.module';
import { UserManagementModule } from './features/user-management/user-management.module';
import { AstrologerManagementModule } from './features/astrologer-management/astrologer-management.module';
import { OrdersModule } from './features/orders/orders.module';
import { AdminPaymentsFeatureModule } from './features/payments/payments.module';
import { AnalyticsModule } from './features/analytics/analytics.module';
import { AdminNotificationsModule } from './features/notifications/notifications.module';
import { MonitoringModule } from './features/monitoring/monitoring.module';
import { AdminReportsModule } from './features/reports/admin-reports.module';

// Admin Management Controller (for managing admins)
import { AdminManagementController } from './features/admin-management/controllers/admin-management.controller';
import { AdminManagementService } from './features/admin-management/services/admin-management.service';

@Module({
  imports: [
    ConfigModule,
    
    // Core schemas available globally within admin module
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: AdminRole.name, schema: AdminRoleSchema },
    ]),
    
    // Feature modules
    AuthModule,
    ActivityLogsModule,
    UserManagementModule,
    AstrologerManagementModule,
    OrdersModule,
    AdminPaymentsFeatureModule,
    AnalyticsModule,
    AdminNotificationsModule,
    MonitoringModule,
    AdminReportsModule,
  ],
  controllers: [
    AdminManagementController,
  ],
  providers: [
    AdminAuthGuard,
    PermissionsGuard,
    AdminManagementService,
  ],
  exports: [
    AuthModule,
    ActivityLogsModule,
    AdminNotificationsModule,
    MongooseModule,
    AdminAuthGuard,
    PermissionsGuard,
  ],
})
export class AdminModule {}
