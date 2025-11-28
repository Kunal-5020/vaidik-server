// src/admin/features/astrologer-management/astrologer-management.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Astrologer, AstrologerSchema } from '../../../astrologers/schemas/astrologer.schema';
import { User, UserSchema } from '../../../users/schemas/user.schema';
import { Registration, RegistrationSchema } from '../../../registration/schemas/registration.schema';
import { Order, OrderSchema } from '../../../orders/schemas/orders.schema';

import { AdminAstrologersController } from './controllers/admin-astrologers.controller';
import { AdminRegistrationController } from './controllers/admin-registration.controller';

import { AdminAstrologersService } from './services/admin-astrologers.service';
import { AdminRegistrationService } from './services/admin-registration.service';

import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin, AdminSchema } from '../../core/schemas/admin.schema';

@Module({
  imports: [
    ConfigModule, // ✅ Required
    JwtModule.registerAsync({ // ✅ Required
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Astrologer.name, schema: AstrologerSchema },
      { name: User.name, schema: UserSchema },
      { name: Registration.name, schema: RegistrationSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
    ActivityLogsModule,
    forwardRef(() => require('../../../notifications/notifications.module').NotificationsModule),
  ],
  controllers: [
    AdminAstrologersController,
    AdminRegistrationController,
  ],
  providers: [
    AdminAstrologersService,
    AdminRegistrationService,
  ],
  exports: [
    AdminAstrologersService,
    AdminRegistrationService,
  ],
})
export class AstrologerManagementModule {}
