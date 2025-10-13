import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument, AstrologerOnboardingStatus } from '../../astrologers/schemas/astrologer.schema';
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
    filters?: { status?: string; onboardingStatus?: string; search?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.accountStatus = filters.status;
    if (filters?.onboardingStatus) query['onboarding.status'] = filters.onboardingStatus;
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

    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find({ 'onboarding.status': AstrologerOnboardingStatus.WAITLIST })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.astrologerModel.countDocuments({ 'onboarding.status': AstrologerOnboardingStatus.WAITLIST }),
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
    const astrologer = await this.astrologerModel.findById(astrologerId).lean();
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer,
    };
  }

  async approveAstrologer(astrologerId: string, adminId: string, adminNotes?: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.onboarding.status = AstrologerOnboardingStatus.APPROVED;
    astrologer.onboarding.approval = {
  approvedAt: new Date(),
  approvedBy: adminId as any, // ✅ Add adminId
  adminNotes: adminNotes || '',
  canLogin: true, // ✅ Add canLogin
};

    astrologer.accountStatus = 'active';

    await astrologer.save();

    // Send notification
    await this.notificationService.sendNotification({
      recipientId: astrologerId,
      recipientModel: 'Astrologer',
      type: 'astrologer_approved',
      title: 'Application Approved! 🎉',
      message: 'Congratulations! Your astrologer application has been approved. You can now start taking consultations.',
      priority: 'high',
    });

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.approved',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: {
        astrologerName: astrologer.name,
        adminNotes,
      },
    });

    return {
      success: true,
      message: 'Astrologer approved successfully',
      data: astrologer,
    };
  }

  async rejectAstrologer(astrologerId: string, adminId: string, reason: string): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.onboarding.status = AstrologerOnboardingStatus.REJECTED;
    astrologer.accountStatus = 'inactive';

    await astrologer.save();

    // Send notification
    await this.notificationService.sendNotification({
      recipientId: astrologerId,
      recipientModel: 'Astrologer',
      type: 'astrologer_approved',
      title: 'Application Update',
      message: `Your application has been reviewed. Reason: ${reason}`,
      priority: 'high',
    });

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'astrologer.rejected',
      module: 'astrologers',
      targetId: astrologerId,
      targetType: 'Astrologer',
      status: 'success',
      details: {
        astrologerName: astrologer.name,
        reason,
      },
    });

    return {
      success: true,
      message: 'Astrologer application rejected',
    };
  }

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

  // ✅ Fix pricing field names to match schema
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
    const [total, active, pending, approved, rejected] = await Promise.all([
      this.astrologerModel.countDocuments(),
      this.astrologerModel.countDocuments({ accountStatus: 'active' }),
      this.astrologerModel.countDocuments({ 'onboarding.status': AstrologerOnboardingStatus.WAITLIST }),
      this.astrologerModel.countDocuments({ 'onboarding.status': AstrologerOnboardingStatus.APPROVED }),
      this.astrologerModel.countDocuments({ 'onboarding.status': AstrologerOnboardingStatus.REJECTED }),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        pending,
        approved,
        rejected,
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
