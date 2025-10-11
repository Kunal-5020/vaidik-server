import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReportsService } from '../services/reports.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string };
}

@Controller('astrologer/reports')
@UseGuards(JwtAuthGuard)
export class AstrologerReportsController {
  constructor(private reportsService: ReportsService) {}

  // Create report for user
  @Post()
  async createReport(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) createDto: CreateReportDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.reportsService.createReport(astrologerId, createDto);
  }

  // Get astrologer's reports
  @Get()
  async getReports(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.reportsService.getAstrologerReports(
      astrologerId,
      page,
      limit,
      { status, type }
    );
  }

  // Update report
  @Patch(':reportId')
  async updateReport(
    @Param('reportId') reportId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) updateDto: UpdateReportDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.reportsService.updateReport(reportId, astrologerId, updateDto);
  }

  // Delete report
  @Delete(':reportId')
  async deleteReport(
    @Param('reportId') reportId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.reportsService.deleteReport(reportId, astrologerId);
  }

  // Get report statistics
  @Get('stats/summary')
  async getReportStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.reportsService.getAstrologerReportStats(astrologerId);
  }
}
