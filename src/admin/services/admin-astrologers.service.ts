// src/admin/services/admin-astrologers.service.ts (Fixed - Remove missing imports)
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { CallSession, CallSessionDocument } from '../../calls/schemas/call-session.schema';

export interface GetAstrologersQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  specialization?: string;
}

export interface AstrologerSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  specializations: string[];
  experience: number;
  rating: number;
  totalRatings: number;
  isOnline: boolean;
  isAvailable: boolean;
  totalEarnings: number;
  sessionsCount: number;
  reviewsCount: number;
  joinedAt: Date;
}

@Injectable()
export class AdminAstrologersService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(CallSession.name) private callModel: Model<CallSessionDocument>,
  ) {}

  async getAstrologers(query: GetAstrologersQuery) {
    const { page, limit, search, status, specialization } = query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = {};
    
    if (search) {
      filter.$or = [
        { 'profile.name': { $regex: search, $options: 'i' } },
        { 'profile.email': { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    if (specialization) {
      filter['profile.specializations'] = { $in: [specialization] };
    }

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find(filter)
        .select('profile phone status ratings experience wallet createdAt isOnline isAvailable')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments(filter),
    ]);

    // Get additional data for each astrologer
    const astrologerSummaries: AstrologerSummary[] = await Promise.all(
      astrologers.map(async (astrologer) => {
        const sessionsCount = await this.getSessionsCount(astrologer._id.toString());

        return {
          id: astrologer._id.toString(),
          name: (astrologer as any).profile?.name || 'Unknown', // Fix: Type assertion
          phone: (astrologer as any).phone || '',
          email: (astrologer as any).profile?.email || '',
          status: (astrologer as any).status || 'pending',
          specializations: (astrologer as any).profile?.specializations || [],
          experience: (astrologer as any).experience || 0,
          rating: (astrologer as any).ratings?.average || 0,
          totalRatings: (astrologer as any).ratings?.total || 0,
          isOnline: (astrologer as any).isOnline || false,
          isAvailable: (astrologer as any).isAvailable || false,
          totalEarnings: 0, // Will implement when wallet transaction schema is available
          sessionsCount,
          reviewsCount: 0, // Will implement when review schema is available
          joinedAt: astrologer.createdAt || new Date(),
        };
      })
    );

    return {
      astrologers: astrologerSummaries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAstrologer(astrologerId: string) {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Get detailed statistics
    const sessionsCount = await this.getSessionsCount(astrologerId);

    return {
      astrologer: {
        id: astrologer._id,
        profile: (astrologer as any).profile,
        phone: (astrologer as any).phone,
        status: (astrologer as any).status,
        experience: (astrologer as any).experience,
        languages: (astrologer as any).languages,
        specializations: (astrologer as any).profile?.specializations,
        rating: (astrologer as any).ratings?.average || 0,
        totalRatings: (astrologer as any).ratings?.total || 0,
        isOnline: (astrologer as any).isOnline,
        isAvailable: (astrologer as any).isAvailable,
        pricing: (astrologer as any).pricing,
        availability: (astrologer as any).availability,
        documents: (astrologer as any).documents,
        joinedAt: astrologer.createdAt,
      },
      statistics: {
        totalEarnings: 0,
        sessionsCount,
        reviewsCount: 0,
        averageSessionDuration: 0,
        monthlyEarnings: [],
      },
      recentActivity: {
        sessions: [],
        reviews: [],
      },
    };
  }

  async approveAstrologer(astrologerId: string, adminId: string) {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if ((astrologer as any).status === 'approved') {
      throw new BadRequestException('Astrologer is already approved');
    }

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminId,
    });

    return { message: 'Astrologer approved successfully' };
  }

  async rejectAstrologer(astrologerId: string, reason: string, adminId: string) {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      status: 'rejected',
      rejectionReason: reason,
      rejectedAt: new Date(),
      rejectedBy: adminId,
    });

    return { message: 'Astrologer rejected successfully' };
  }

  async suspendAstrologer(astrologerId: string, reason: string, adminId: string) {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      status: 'suspended',
      suspensionReason: reason,
      suspendedAt: new Date(),
      suspendedBy: adminId,
      isAvailable: false,
    });

    return { message: 'Astrologer suspended successfully' };
  }

  async getAstrologerEarnings(astrologerId: string, startDate?: Date, endDate?: Date) {
    // Return mock data for now - implement when transaction schema is available
    return {
      summary: {
        total: 0,
        byPurpose: {},
      },
      transactions: [],
    };
  }

  // Private helper methods
  private async getSessionsCount(astrologerId: string): Promise<number> {
    return this.callModel.countDocuments({ astrologerId, status: 'completed' });
  }
}
