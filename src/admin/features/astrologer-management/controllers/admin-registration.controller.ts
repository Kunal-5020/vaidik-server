// src/admin/features/astrologer-management/controllers/admin-registration.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminRegistrationService } from '../services/admin-registration.service';
import { CompleteInterviewDto } from '../dto/complete-interview.dto';
import { ShortlistDto } from '../dto/shortlist.dto';
import { RejectRegistrationDto } from '../dto/reject-registration.dto';

@Controller('admin/registrations')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminRegistrationController {
  constructor(private adminRegistrationService: AdminRegistrationService) {}

  /**
   * GET /admin/registrations
   * Get all registrations (waitlist, interviews, approved, rejected)
   */
  @Get()
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getAllRegistrations(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminRegistrationService.getAllRegistrations(page, limit, { status, search });
  }

  /**
   * GET /admin/registrations/waitlist
   * Get waitlist registrations
   */
  @Get('waitlist')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getWaitlist(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.adminRegistrationService.getWaitlist(page, limit);
  }

  /**
   * GET /admin/registrations/stats
   * Get registration statistics
   */
  @Get('stats/summary')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getRegistrationStats() {
    return this.adminRegistrationService.getRegistrationStats();
  }

  /**
   * GET /admin/registrations/:registrationId
   * Get registration details
   */
  @Get(':registrationId')
  @RequirePermissions(Permissions.ASTROLOGERS_VIEW)
  async getRegistrationDetails(@Param('registrationId') registrationId: string) {
    return this.adminRegistrationService.getRegistrationDetails(registrationId);
  }

  /**
   * POST /admin/registrations/:registrationId/shortlist
   * Shortlist candidate from waitlist
   */
  @Post(':registrationId/shortlist')
  @RequirePermissions(Permissions.ASTROLOGERS_APPROVE)
  async shortlistCandidate(
    @Param('registrationId') registrationId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) shortlistDto: ShortlistDto,
  ) {
    return this.adminRegistrationService.shortlistCandidate(
      registrationId,
      admin._id,
      shortlistDto.notes,
    );
  }

  /**
   * POST /admin/registrations/:registrationId/interview/:round/complete
   * Complete interview round
   */
  @Post(':registrationId/interview/:round/complete')
  @RequirePermissions(Permissions.ASTROLOGERS_APPROVE)
  async completeInterviewRound(
    @Param('registrationId') registrationId: string,
    @Param('round', ParseIntPipe) round: number,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) interviewDto: CompleteInterviewDto,
  ) {
    return this.adminRegistrationService.completeInterviewRound(
      registrationId,
      round,
      admin._id,
      interviewDto,
    );
  }

  /**
   * POST /admin/registrations/:registrationId/reject
   * Reject registration
   */
  @Post(':registrationId/reject')
  @RequirePermissions(Permissions.ASTROLOGERS_REJECT)
  async rejectRegistration(
    @Param('registrationId') registrationId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) rejectDto: RejectRegistrationDto,
  ) {
    return this.adminRegistrationService.rejectRegistration(
      registrationId,
      admin._id,
      rejectDto.reason,
      rejectDto.canReapply,
    );
  }
}
