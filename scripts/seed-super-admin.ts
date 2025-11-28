// scripts/seed-super-admin.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const AdminModel = app.get(getModelToken('Admin'));
  const AdminRoleModel = app.get(getModelToken('AdminRole'));

  // Create Super Admin role
  const superAdminRole = await AdminRoleModel.findOneAndUpdate(
    { name: 'super_admin' },
    {
      name: 'super_admin',
      displayName: 'Super Admin',
      permissions: ['*'], // All permissions
      isSystemRole: true,
    },
    { upsert: true, new: true }
  );

  // Check if super admin already exists
  const existing = await AdminModel.findOne({ email: 'admin@yourdomain.com' });
  if (existing) {
    console.log('✅ Super admin already exists');
    await app.close();
    return;
  }

  // Create super admin
  const hashedPassword = await bcrypt.hash('Admin@123456', 10);
  
  const superAdmin = new AdminModel({
    adminId: 'ADMIN_0001',
    name: 'Super Admin',
    email: 'admin@yourdomain.com',
    password: hashedPassword,
    phoneNumber: '+919999999999',
    roleId: superAdminRole._id,
    roleType: 'super_admin',
    department: 'Administration',
    status: 'active',
    isSuperAdmin: true,
    requirePasswordChange: true,
    createdAt: new Date(),
  });

  await superAdmin.save();
  
  console.log('✅ Super admin created successfully');
  console.log('Email: admin@yourdomain.com');
  console.log('Password: Admin@123456');
  console.log('⚠️  Please change the password after first login!');

  await app.close();
}

bootstrap();
