import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from '../schemas/reports.schema';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
  ) {}

  // ===== ASTROLOGER METHODS =====

  // Create report (astrologer creates for user)
  async createReport(
    astrologerId: string,
    createDto: CreateReportDto
  ): Promise<any> {
    const reportId = `RPT_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const report = new this.reportModel({
      reportId,
      userId: createDto.userId,
      orderId: createDto.orderId,
      astrologerId,
      type: createDto.type,
      title: createDto.title,
      content: createDto.content,
      status: 'pending',
      createdAt: new Date()
    });

    await report.save();

    return {
      success: true,
      message: 'Report created successfully',
      data: report
    };
  }

  // Update report (astrologer updates content/status)
  async updateReport(
    reportId: string,
    astrologerId: string,
    updateDto: UpdateReportDto
  ): Promise<any> {
    const report = await this.reportModel.findOne({ reportId, astrologerId });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (updateDto.content !== undefined) report.content = updateDto.content;
    if (updateDto.status !== undefined) report.status = updateDto.status;
    if (updateDto.astrologerNotes !== undefined) report.astrologerNotes = updateDto.astrologerNotes;
    if (updateDto.failureReason !== undefined) report.failureReason = updateDto.failureReason;

    // If marking as completed, set deliveredAt
    if (updateDto.status === 'completed' && !report.deliveredAt) {
      report.deliveredAt = new Date();
    }

    await report.save();

    return {
      success: true,
      message: 'Report updated successfully',
      data: report
    };
  }

  // Upload report file (PDF)
  async uploadReportFile(
    reportId: string,
    astrologerId: string,
    filePath: string,
    fileS3Key: string,
    fileSize: number
  ): Promise<any> {
    const report = await this.reportModel.findOne({ reportId, astrologerId });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    report.filePath = filePath;
    report.fileS3Key = fileS3Key;
    report.fileSize = fileSize;
    report.status = 'completed';
    report.deliveredAt = new Date();

    await report.save();

    return {
      success: true,
      message: 'Report file uploaded successfully',
      data: {
        reportId: report.reportId,
        filePath: report.filePath,
        fileSize: report.fileSize
      }
    };
  }

  // Get reports created by astrologer
  async getAstrologerReports(
    astrologerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { astrologerId };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(query)
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // ===== USER METHODS =====

  // Get user's reports
  async getUserReports(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { userId };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(query)
        .populate('astrologerId', 'name profilePicture experienceYears specializations')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // Get single report details
  async getReportDetails(reportId: string, userId: string): Promise<any> {
    const report = await this.reportModel
      .findOne({ reportId, userId })
      .populate('astrologerId', 'name profilePicture experienceYears specializations ratings')
      .lean();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return {
      success: true,
      data: report
    };
  }

  // Download report (increment download count)
  async downloadReport(reportId: string, userId: string): Promise<any> {
    const report = await this.reportModel.findOne({
      reportId,
      userId,
      status: 'completed'
    });

    if (!report) {
      throw new NotFoundException('Report not found or not yet completed');
    }

    if (!report.filePath) {
      throw new BadRequestException('Report file not available');
    }

    // Increment download count
    report.downloadCount = (report.downloadCount || 0) + 1;
    report.lastDownloadedAt = new Date();
    await report.save();

    return {
      success: true,
      data: {
        reportId: report.reportId,
        filePath: report.filePath,
        fileName: `${report.title.replace(/\s+/g, '_')}.pdf`,
        downloadCount: report.downloadCount
      }
    };
  }

  // ===== STATISTICS =====

  async getUserReportStats(userId: string): Promise<any> {
    const [total, completed, pending, inProgress, byType] = await Promise.all([
      this.reportModel.countDocuments({ userId }),
      this.reportModel.countDocuments({ userId, status: 'completed' }),
      this.reportModel.countDocuments({ userId, status: 'pending' }),
      this.reportModel.countDocuments({ userId, status: 'in_progress' }),
      this.reportModel.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    return {
      success: true,
      data: {
        total,
        completed,
        pending,
        inProgress,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  async getAstrologerReportStats(astrologerId: string): Promise<any> {
    const [total, completed, pending, inProgress, byType, totalDownloads] = await Promise.all([
      this.reportModel.countDocuments({ astrologerId }),
      this.reportModel.countDocuments({ astrologerId, status: 'completed' }),
      this.reportModel.countDocuments({ astrologerId, status: 'pending' }),
      this.reportModel.countDocuments({ astrologerId, status: 'in_progress' }),
      this.reportModel.aggregate([
        { $match: { astrologerId: astrologerId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      this.reportModel.aggregate([
        { $match: { astrologerId: astrologerId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$downloadCount' } } }
      ])
    ]);

    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    return {
      success: true,
      data: {
        total,
        completed,
        pending,
        inProgress,
        completionRate: `${completionRate}%`,
        totalDownloads: totalDownloads[0]?.total || 0,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  // ===== INTERNAL METHODS =====

  async getReportsByOrderId(orderId: string): Promise<ReportDocument[]> {
    return this.reportModel.find({ orderId }).sort({ createdAt: -1 });
  }

  async deleteReport(reportId: string, astrologerId: string): Promise<any> {
    const report = await this.reportModel.findOne({ reportId, astrologerId });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Only allow deletion if status is pending or failed
    if (report.status !== 'pending' && report.status !== 'failed') {
      throw new BadRequestException('Cannot delete completed or in-progress reports');
    }

    await report.deleteOne();

    return {
      success: true,
      message: 'Report deleted successfully'
    };
  }
}
