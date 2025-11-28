// src/admin/features/astrologer-management/controllers/admin-astrologers.controller.ts
import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
  Delete,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminAstrologersService } from '../services/admin-astrologers.service';
import { UpdatePricingDto } from '../dto/update-pricing.dto';
import { AstrologerQueryDto } from '../dto/astrologer-query.dto';

@Controller('admin/astrologers')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAstrologersController {
  constructor(private adminAstrologersService: AdminAstrologersService) {}

  /**
   * GET /admin/astrologers
   * Get all astrologers with filters
   */
  @Get()
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAllAstrologers(
    @Query(ValidationPipe) queryDto: AstrologerQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const filters = {
      status: queryDto.status,
      search: queryDto.search,
      specialization: queryDto.specialization,
      isProfileComplete: queryDto.isProfileComplete,
      startDate: queryDto.startDate ? new Date(queryDto.startDate) : undefined,
      endDate: queryDto.endDate ? new Date(queryDto.endDate) : undefined,
    };

    return this.adminAstrologersService.getAllAstrologers(page, limit, filters);
  }

  /**
   * GET /admin/astrologers/stats
   * Get astrologer statistics
   */
  @Get('stats')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAstrologerStats() {
    return this.adminAstrologersService.getAstrologerStats();
  }

  /**
   * GET /admin/astrologers/pending
   * Get astrologers with incomplete profiles
   */
  @Get('pending')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getPendingAstrologers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.adminAstrologersService.getPendingAstrologers(page, limit);
  }

  /**
   * GET /admin/astrologers/top-performers
   * Get top performing astrologers
   */
  @Get('top-performers')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getTopPerformers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.adminAstrologersService.getTopPerformers(limit);
  }

  /**
   * GET /admin/astrologers/:astrologerId
   * Get astrologer details
   */
  @Get(':astrologerId')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAstrologerDetails(@Param('astrologerId') astrologerId: string) {
    return this.adminAstrologersService.getAstrologerDetails(astrologerId);
  }

  /**
   * GET /admin/astrologers/:astrologerId/performance
   * Get astrologer performance metrics
   */
  @Get(':astrologerId/performance')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAstrologerPerformance(@Param('astrologerId') astrologerId: string) {
    return this.adminAstrologersService.getAstrologerPerformance(astrologerId);
  }

  /**
   * PATCH /admin/astrologers/:astrologerId/status
   * Update astrologer status
   */
  @Patch(':astrologerId/status')
  @RequirePermissions(Permissions.ASTROLOGERS_BLOCK)
  async updateAstrologerStatus(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('status') status: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminAstrologersService.updateAstrologerStatus(
      astrologerId,
      admin._id,
      status,
      reason,
    );
  }

  /**
   * PATCH /admin/astrologers/:astrologerId/pricing
   * Update astrologer pricing
   */
  @Patch(':astrologerId/pricing')
  @RequirePermissions(Permissions.ASTROLOGERS_PRICING)
  async updatePricing(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) pricingData: UpdatePricingDto,
  ) {
    return this.adminAstrologersService.updatePricing(astrologerId, admin._id, pricingData);
  }

  /**
   * PATCH /admin/astrologers/:astrologerId/bio
   * Update astrologer bio
   */
  @Patch(':astrologerId/bio')
  @RequirePermissions(Permissions.ASTROLOGERS_EDIT)
  async updateBio(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('bio') bio: string,
  ) {
    return this.adminAstrologersService.updateBio(astrologerId, admin._id, bio);
  }

  /**
   * PATCH /admin/astrologers/:astrologerId/features
   * Toggle features (chat, call, livestream)
   */
  @Patch(':astrologerId/features')
  @RequirePermissions(Permissions.ASTROLOGERS_EDIT)
  async toggleFeatures(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('isChatEnabled') isChatEnabled?: boolean,
    @Body('isCallEnabled') isCallEnabled?: boolean,
    @Body('isLiveStreamEnabled') isLiveStreamEnabled?: boolean,
  ) {
    return this.adminAstrologersService.toggleFeatures(astrologerId, admin._id, {
      isChatEnabled,
      isCallEnabled,
      isLiveStreamEnabled,
    });
  }

  /**
   * DELETE /admin/astrologers/:astrologerId
   * Soft delete astrologer
   */
  @Delete(':astrologerId')
  @RequirePermissions(Permissions.ASTROLOGERS_DELETE)
  async deleteAstrologer(
    @Param('astrologerId') astrologerId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason?: string,
  ) {
    return this.adminAstrologersService.deleteAstrologer(astrologerId, admin._id, reason);
  }
}
