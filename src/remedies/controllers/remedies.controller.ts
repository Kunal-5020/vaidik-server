import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RemediesService } from '../services/remedies.service';
import { UpdateRemedyStatusDto } from '../dto/update-remedy-status.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('remedies')
@UseGuards(JwtAuthGuard)
export class RemediesController {
  constructor(private remediesService: RemediesService) {}

  // Get user's remedies
  @Get()
  async getRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.remediesService.getUserRemedies(
      req.user._id,
      page,
      limit,
      { status, type }
    );
  }

  // Get single remedy details
  @Get(':remedyId')
  async getRemedyDetails(
    @Param('remedyId') remedyId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.remediesService.getRemedyDetails(remedyId, req.user._id);
  }

  // Accept/Reject remedy
  @Patch(':remedyId/status')
  async updateRemedyStatus(
    @Param('remedyId') remedyId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateRemedyStatusDto
  ) {
    return this.remediesService.updateRemedyStatus(
      remedyId,
      req.user._id,
      updateDto
    );
  }

  // Get remedy statistics
  @Get('stats/summary')
  async getRemedyStats(@Req() req: AuthenticatedRequest) {
    return this.remediesService.getUserRemedyStats(req.user._id);
  }
}
