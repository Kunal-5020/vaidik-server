import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class UserBlockingService {
  private readonly logger = new Logger(UserBlockingService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // Block an astrologer
  async blockAstrologer(
    userId: Types.ObjectId,
    astrologerId: string,
    reason: string,
  ) {
    // Validate ObjectId format FIRST
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    // Validate reason length
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Reason must be at least 10 characters');
    }

    // Convert to ObjectId for query
    const astrologerObjectId = new Types.ObjectId(astrologerId);

    // Verify astrologer exists
    const astrologer = await this.astrologerModel.findById(astrologerObjectId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Get user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already blocked
    const isBlocked = user.blockedAstrologers?.some(
      (block) => block.astrologerId.toString() === astrologerId,
    );
    if (isBlocked) {
      throw new BadRequestException('Astrologer is already blocked');
    }

    // Add to blocked list
    await this.userModel.findByIdAndUpdate(userId, {
      $push: {
        blockedAstrologers: {
          astrologerId: astrologerObjectId,
          reason: reason.trim(),
          blockedAt: new Date(),
        },
      },
    });

    this.logger.log(`User ${userId} blocked astrologer ${astrologerId}. Reason: ${reason}`);

    return {
      success: true,
      message: 'Astrologer blocked successfully',
      data: {
        astrologerId,
        astrologerName: astrologer.name,
        blockedAt: new Date(),
      },
    };
  }

  // Unblock an astrologer
  async unblockAstrologer(userId: Types.ObjectId, astrologerId: string) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if astrologer is blocked
    const isBlocked = user.blockedAstrologers?.some(
      (block) => block.astrologerId.toString() === astrologerId,
    );
    if (!isBlocked) {
      throw new BadRequestException('Astrologer is not blocked');
    }

    // Remove from blocked list
    await this.userModel.findByIdAndUpdate(
      userId,
      {
        $pull: {
          blockedAstrologers: { astrologerId: new Types.ObjectId(astrologerId) },
        },
      },
      { new: true },
    );

    this.logger.log(`User ${userId} unblocked astrologer ${astrologerId}`);

    return {
      success: true,
      message: 'Astrologer unblocked successfully',
    };
  }

  // ✅ FIXED: Get user's blocked list with proper populate
  async getBlockedAstrologers(userId: Types.ObjectId) {
    this.logger.log(`Fetching blocked list for user: ${userId}`);

    const user = await this.userModel
      .findById(userId)
      .populate({
        path: 'blockedAstrologers.astrologerId',
        model: 'Astrologer', // ✅ Explicitly specify model name
        select: 'name profilePicture experienceYears specializations ratings',
        options: { strictPopulate: false },
      })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Transform and filter the data
    const blockedList = (user.blockedAstrologers || [])
      .map((block: any) => {
        // Skip if astrologer was deleted or not populated
        if (!block.astrologerId || typeof block.astrologerId === 'string') {
          this.logger.warn(`Astrologer ${block.astrologerId} not found or deleted`);
          return null;
        }

        return {
          astrologer: {
            _id: block.astrologerId._id,
            name: block.astrologerId.name,
            profilePicture: block.astrologerId.profilePicture,
            experienceYears: block.astrologerId.experienceYears,
            specializations: block.astrologerId.specializations,
            ratings: block.astrologerId.ratings,
          },
          reason: block.reason,
          blockedAt: block.blockedAt,
        };
      })
      .filter(item => item !== null);

    this.logger.log(`Found ${blockedList.length} blocked astrologers for user ${userId}`);
    
    if (blockedList.length > 0) {
      this.logger.debug(`Sample blocked item: ${JSON.stringify(blockedList[0])}`);
    }

    return {
      success: true,
      data: blockedList,
      count: blockedList.length,
    };
  }

  async isAstrologerBlocked(userId: Types.ObjectId, astrologerId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(astrologerId)) {
      return false;
    }

    const user = await this.userModel
      .findById(userId)
      .select('blockedAstrologers')
      .lean();

    return user?.blockedAstrologers?.some(
      (block) => block.astrologerId.toString() === astrologerId,
    ) || false;
  }

  async getBlockingStats() {
    const stats = await this.userModel.aggregate([
      { $unwind: '$blockedAstrologers' },
      {
        $group: {
          _id: '$blockedAstrologers.astrologerId',
          blockCount: { $sum: 1 },
          reasons: { $push: '$blockedAstrologers.reason' },
          lastBlockedAt: { $max: '$blockedAstrologers.blockedAt' },
        },
      },
      { $sort: { blockCount: -1 } },
      { $limit: 10 },
    ]);

    const totalBlocks = await this.userModel.aggregate([
      { $unwind: '$blockedAstrologers' },
      { $count: 'total' },
    ]);

    return {
      success: true,
      data: {
        topBlockedAstrologers: stats,
        totalBlocks: totalBlocks[0]?.total || 0,
      },
    };
  }
}
