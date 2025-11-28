// src/admin/features/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';


// Core schemas
import { Admin, AdminSchema } from '../../core/schemas/admin.schema';
import { AdminRole, AdminRoleSchema } from '../../core/schemas/index';


// Import Activity Logs Module
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';


// Controllers & Services
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';


@Module({
  imports: [
    ConfigModule,
    
    // JWT Configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<JwtModuleOptions> => {
        return {
          secret: configService.get<string>('ADMIN_JWT_SECRET') || 'fby34f82y34bfuibetheryjh5h6554u',
          signOptions: {
            expiresIn:  7 * 24 * 60 * 60, // 7 days
          },
        };
      },
    }),
    
    // MongoDB Schemas
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: AdminRole.name, schema: AdminRoleSchema },
    ]),
    
    // Activity Logs for tracking login/logout
    ActivityLogsModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
  exports: [AdminAuthService, JwtModule], // Export for use in other modules
})
export class AuthModule {}
