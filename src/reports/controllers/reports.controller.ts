import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReportsService } from '../services/reports.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  // Get user's reports
  @Get()
  async getReports(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.reportsService.getUserReports(
      req.user._id,
      page,
      limit,
      { status, type }
    );
  }

  // Get single report details
  @Get(':reportId')
  async getReportDetails(
    @Param('reportId') reportId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.reportsService.getReportDetails(reportId, req.user._id);
  }

  // Download report
  @Get(':reportId/download')
  async downloadReport(
    @Param('reportId') reportId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.reportsService.downloadReport(reportId, req.user._id);
  }

  // Get report statistics
  @Get('stats/summary')
  async getReportStats(@Req() req: AuthenticatedRequest) {
    return this.reportsService.getUserReportStats(req.user._id);
  }
}
