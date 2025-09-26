// src/admin/controllers/admin-astrologers.controller.ts (Fixed)
import { 
  Controller, 
  Get, 
  Patch, 
  Param, 
  Body, 
  Query,
  UseGuards,
  ValidationPipe 
} from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminPermission } from '../enums/admin-role.enum';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AdminDocument } from '../schemas/admin.schema';
import { AdminAstrologersService } from '../services/admin-astrologers.service';
import type { GetAstrologersQueryDto } from '../dto/astrologer/get-astrologers-query.dto';
import type { RejectAstrologerDto } from '../dto/astrologer/reject-astrologer.dto';
import type { SuspendAstrologerDto } from '../dto/astrologer/suspend-astrologer.dto';

@Controller('admin/astrologers')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAstrologersController {
  constructor(private adminAstrologersService: AdminAstrologersService) {}

  @Get()
  @RequirePermissions(AdminPermission.VIEW_ASTROLOGERS)
  async getAstrologers(
    @Query(ValidationPipe) query: GetAstrologersQueryDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    // Fix: Provide defaults for required service parameters
    const serviceQuery = {
      page: query.page || 1,
      limit: query.limit || 20,
      search: query.search,
      status: query.status,
      specialization: query.specialization,
    };

    return {
      success: true,
      data: await this.adminAstrologersService.getAstrologers(serviceQuery),
    };
  }

  @Get(':astrologerId')
  @RequirePermissions(AdminPermission.VIEW_ASTROLOGERS)
  async getAstrologer(@Param('astrologerId') astrologerId: string) {
    return {
      success: true,
      data: await this.adminAstrologersService.getAstrologer(astrologerId),
    };
  }

  @Patch(':astrologerId/approve')
  @RequirePermissions(AdminPermission.APPROVE_ASTROLOGERS)
  async approveAstrologer(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminAstrologersService.approveAstrologer(
        astrologerId,
        (admin._id as string).toString()
      ),
      message: 'Astrologer approved successfully',
    };
  }

  @Patch(':astrologerId/reject')
  @RequirePermissions(AdminPermission.APPROVE_ASTROLOGERS)
  async rejectAstrologer(
    @Param('astrologerId') astrologerId: string,
    @Body(ValidationPipe) rejectDto: RejectAstrologerDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminAstrologersService.rejectAstrologer(
        astrologerId,
        rejectDto.reason,
        (admin._id as string).toString()
      ),
      message: 'Astrologer rejected successfully',
    };
  }

  @Patch(':astrologerId/suspend')
  @RequirePermissions(AdminPermission.MANAGE_ASTROLOGERS)
  async suspendAstrologer(
    @Param('astrologerId') astrologerId: string,
    @Body(ValidationPipe) suspendDto: SuspendAstrologerDto,
    @CurrentAdmin() admin: AdminDocument,
  ) {
    return {
      success: true,
      data: await this.adminAstrologersService.suspendAstrologer(
        astrologerId,
        suspendDto.reason,
        (admin._id as string).toString()
      ),
      message: 'Astrologer suspended successfully',
    };
  }

  @Get(':astrologerId/earnings')
  @RequirePermissions(AdminPermission.VIEW_TRANSACTIONS)
  async getAstrologerEarnings(
    @Param('astrologerId') astrologerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return {
      success: true,
      data: await this.adminAstrologersService.getAstrologerEarnings(
        astrologerId,
        start,
        end
      ),
    };
  }
}
