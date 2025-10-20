import { Controller, Get, Patch, Param, Query, Body, UseGuards, DefaultValuePipe, ParseIntPipe, ValidationPipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { Permissions } from '../constants/permissions';
import { AdminAstrologersService } from '../services/admin-astrologers.service';

@Controller('admin/astrologers')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAstrologersController {
  constructor(private adminAstrologersService: AdminAstrologersService) {}

  @Get()
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAllAstrologers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    return this.adminAstrologersService.getAllAstrologers(page, limit, { status, search });
  }

  @Get('stats')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAstrologerStats() {
    return this.adminAstrologersService.getAstrologerStats();
  }

  @Get('pending')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getPendingAstrologers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ) {
    return this.adminAstrologersService.getPendingAstrologers(page, limit);
  }

  @Get(':astrologerId')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAstrologerDetails(@Param('astrologerId') astrologerId: string) {
    return this.adminAstrologersService.getAstrologerDetails(astrologerId);
  }

  // ✅ REMOVED: approve/reject endpoints (moved to admin-registration.controller.ts)

  @Patch(':astrologerId/status')
  @RequirePermissions(Permissions.ASTROLOGERS_BLOCK)
  async updateAstrologerStatus(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('status') status: string
  ) {
    return this.adminAstrologersService.updateAstrologerStatus(astrologerId, admin._id, status);
  }

  @Patch(':astrologerId/pricing')
  @RequirePermissions(Permissions.ASTROLOGERS_PRICING)
  async updatePricing(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body() pricingData: any
  ) {
    return this.adminAstrologersService.updatePricing(astrologerId, admin._id, pricingData);
  }

  @Patch(':astrologerId/bio')
  @RequirePermissions(Permissions.ASTROLOGERS_APPROVE)
  async updateBio(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('bio') bio: string
  ) {
    return this.adminAstrologersService.updateBio(astrologerId, admin._id, bio);
  }
}
