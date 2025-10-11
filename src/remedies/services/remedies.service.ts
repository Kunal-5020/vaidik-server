import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Remedy, RemedyDocument } from '../schemas/remedies.schema';
import { CreateRemedyDto } from '../dto/create-remedy.dto';
import { UpdateRemedyStatusDto } from '../dto/update-remedy-status.dto';

@Injectable()
export class RemediesService {
  constructor(
    @InjectModel(Remedy.name) private remedyModel: Model<RemedyDocument>,
  ) {}

  // ===== ASTROLOGER METHODS =====

  // Create remedy (astrologer suggests to user)
  async createRemedy(
    astrologerId: string,
    astrologerName: string,
    createDto: CreateRemedyDto
  ): Promise<any> {
    const remedyId = `REM_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const remedy = new this.remedyModel({
      remedyId,
      userId: createDto.userId,
      orderId: createDto.orderId,
      astrologerId,
      astrologerName,
      title: createDto.title,
      description: createDto.description,
      type: createDto.type,
      status: 'suggested',
      createdAt: new Date()
    });

    await remedy.save();

    return {
      success: true,
      message: 'Remedy suggested successfully',
      data: remedy
    };
  }

  // Get remedies suggested by astrologer
  async getAstrologerRemedies(
    astrologerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { astrologerId };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        remedies,
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

  // Get remedies for user
  async getUserRemedies(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { status?: string; type?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { userId };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate('astrologerId', 'name profilePicture experienceYears specializations')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        remedies,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // Get single remedy details
  async getRemedyDetails(remedyId: string, userId: string): Promise<any> {
    const remedy = await this.remedyModel
      .findOne({ remedyId, userId })
      .populate('astrologerId', 'name profilePicture experienceYears specializations ratings')
      .lean();

    if (!remedy) {
      throw new NotFoundException('Remedy not found');
    }

    return {
      success: true,
      data: remedy
    };
  }

  // Update remedy status (user accepts/rejects)
  async updateRemedyStatus(
    remedyId: string,
    userId: string,
    updateDto: UpdateRemedyStatusDto
  ): Promise<any> {
    const remedy = await this.remedyModel.findOne({
      remedyId,
      userId,
      status: 'suggested'
    });

    if (!remedy) {
      throw new NotFoundException('Remedy not found or already responded');
    }

    remedy.status = updateDto.status;
    remedy.userNotes = updateDto.notes;

    if (updateDto.status === 'accepted') {
      remedy.acceptedAt = new Date();
    } else if (updateDto.status === 'rejected') {
      remedy.rejectedAt = new Date();
    }

    await remedy.save();

    return {
      success: true,
      message: `Remedy ${updateDto.status} successfully`,
      data: remedy
    };
  }

  // ===== STATISTICS =====

  async getUserRemedyStats(userId: string): Promise<any> {
    const [total, accepted, rejected, byType] = await Promise.all([
      this.remedyModel.countDocuments({ userId }),
      this.remedyModel.countDocuments({ userId, status: 'accepted' }),
      this.remedyModel.countDocuments({ userId, status: 'rejected' }),
      this.remedyModel.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    return {
      success: true,
      data: {
        total,
        accepted,
        rejected,
        pending: total - accepted - rejected,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  async getAstrologerRemedyStats(astrologerId: string): Promise<any> {
    const [total, accepted, rejected, byType] = await Promise.all([
      this.remedyModel.countDocuments({ astrologerId }),
      this.remedyModel.countDocuments({ astrologerId, status: 'accepted' }),
      this.remedyModel.countDocuments({ astrologerId, status: 'rejected' }),
      this.remedyModel.aggregate([
        { $match: { astrologerId: astrologerId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    const acceptanceRate = total > 0 ? ((accepted / total) * 100).toFixed(1) : 0;

    return {
      success: true,
      data: {
        total,
        accepted,
        rejected,
        pending: total - accepted - rejected,
        acceptanceRate: `${acceptanceRate}%`,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  // ===== INTERNAL METHODS =====

  async getRemediesByOrderId(orderId: string): Promise<RemedyDocument[]> {
    return this.remedyModel.find({ orderId }).sort({ createdAt: -1 });
  }
}
