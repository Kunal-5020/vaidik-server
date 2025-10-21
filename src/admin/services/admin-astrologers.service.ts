import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema'; // ✅ Fixed import path
import { NotificationService } from '../../notifications/services/notification.service';
import { AdminActivityLogService } from './admin-activity-log.service';

@Injectable()
export class AdminAstrologersService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private notificationService: NotificationService,
    private activityLogService: AdminActivityLogService,
  ) {}

  async getAllAstrologers(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; search?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.accountStatus = filters.status;
    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phoneNumber: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        astrologers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getPendingAstrologers(page: number = 1, limit: number = 50): Promise<any> {
    const skip = (page - 1) * limit;

    // ✅ Changed: Filter by profile completion instead of onboarding status
    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find({ 
          'profileCompletion.isComplete': false,
          accountStatus: 'active'
        })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments({ 
        'profileCompletion.isComplete': false,
        accountStatus: 'active'
      }),
    ]);

    return {
      success: true,
      data: {
        astrologers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getAstrologerDetails(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId')
      .lean();
      
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer,
    };
  }

  // ✅ REMOVED: approveAstrologer method (now handled by AdminRegistrationService)

  // ✅ REMOVED: rejectAstrologer method (now handled by AdminRegistrationService)

  async updateAstrologerStatus(astrologerId: string, adminId: string, status: string): Promise<any> {
    const astrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: { accountStatus: status } },
      { new: true }
    );

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.status_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: {
        newStatus: status,
      },
    });

    return {
      success: true,
      message: `Astrologer status updated to ${status}`,
      data: astrologer,
    };
  }

  async updatePricing(astrologerId: string, adminId: string, pricingData: any): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Update pricing
    if (pricingData.chatRatePerMinute !== undefined) {
      astrologer.pricing.chat = pricingData.chatRatePerMinute;
    }
    if (pricingData.callRatePerMinute !== undefined) {
      astrologer.pricing.call = pricingData.callRatePerMinute;
    }
    if (pricingData.videoCallRatePerMinute !== undefined) {
      astrologer.pricing.videoCall = pricingData.videoCallRatePerMinute;
    }

    await astrologer.save();

    await this.activityLogService.log({
      adminId,
      action: 'astrologer.pricing_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: pricingData,
    });

    return {
      success: true,
      message: 'Pricing updated successfully',
      data: astrologer.pricing,
    };
  }

  async getAstrologerStats(): Promise<any> {
    const [total, active, pending, completed] = await Promise.all([
      this.astrologerModel.countDocuments(),
      this.astrologerModel.countDocuments({ accountStatus: 'active' }),
      this.astrologerModel.countDocuments({ 
        'profileCompletion.isComplete': false,
        accountStatus: 'active'
      }),
      this.astrologerModel.countDocuments({ 
        'profileCompletion.isComplete': true
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        pendingProfileCompletion: pending,
        profileCompleted: completed,
      },
    };
  }

  async updateBio(astrologerId: string, adminId: string, bio: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const oldBio = astrologer.bio;
    astrologer.bio = bio;
    await astrologer.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.bio_updated',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      changes: {
        before: { bio: oldBio },
        after: { bio: bio },
      },
    });

    return {
      success: true,
      message: 'Bio updated successfully',
      data: { bio: astrologer.bio },
    };
  }
}
