import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { AstrologerSearchDto } from '../../schemas/astrologer-search.dto';

export interface SearchResult {
  astrologers: AstrologerDocument[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

@Injectable()
export class AstrologerSearchService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  async searchAstrologers(searchDto: AstrologerSearchDto): Promise<SearchResult> {
    const {
      search,
      specializations,
      languages,
      minPrice,
      maxPrice,
      minRating,
      status,
      sortBy,
      page = 1,
      limit = 10
    } = searchDto;

    // Build search query
    const query: any = {
      accountStatus: 'active',
      'verification.isVerified': true
    };

    // Text search in name and bio
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by specializations
    if (specializations && specializations.length > 0) {
      query.specializations = { $in: specializations };
    }

    // Filter by languages
    if (languages && languages.length > 0) {
      query.languages = { $in: languages };
    }

    // Filter by price range (using chat price as default)
    if (minPrice !== undefined || maxPrice !== undefined) {
      query['pricing.chat'] = {};
      if (minPrice !== undefined) {
        query['pricing.chat'].$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        query['pricing.chat'].$lte = maxPrice;
      }
    }

    // Filter by minimum rating
    if (minRating !== undefined) {
      query['stats.rating'] = { $gte: minRating };
    }

    // Filter by online status
    if (status === 'online') {
      query.status = 'online';
    }

    // Build sort criteria
    let sortCriteria: any = {};
    switch (sortBy) {
      case 'rating':
        sortCriteria = { 'stats.rating': -1, 'stats.totalRatings': -1 };
        break;
      case 'price_low':
        sortCriteria = { 'pricing.chat': 1 };
        break;
      case 'price_high':
        sortCriteria = { 'pricing.chat': -1 };
        break;
      case 'experience':
        sortCriteria = { experienceYears: -1 };
        break;
      default:
        sortCriteria = { 'stats.rating': -1, status: -1 }; // Default: rating then online status
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute search
    const [astrologers, totalCount] = await Promise.all([
      this.astrologerModel
        .find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name profileImage lastActiveAt')
        .exec(),
      this.astrologerModel.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      astrologers,
      totalCount,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }

  async getFeaturedAstrologers(limit: number = 10): Promise<AstrologerDocument[]> {
    return this.astrologerModel
      .find({
        accountStatus: 'active',
        'verification.isVerified': true,
        'stats.rating': { $gte: 4.0 },
        'stats.totalRatings': { $gte: 10 }
      })
      .sort({ 'stats.rating': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .populate('userId', 'name profileImage')
      .exec();
  }

  async getTopRatedAstrologers(limit: number = 10): Promise<AstrologerDocument[]> {
    return this.astrologerModel
      .find({
        accountStatus: 'active',
        'verification.isVerified': true,
        'stats.totalRatings': { $gte: 5 }
      })
      .sort({ 'stats.rating': -1, 'stats.totalRatings': -1 })
      .limit(limit)
      .populate('userId', 'name profileImage')
      .exec();
  }

  async getOnlineAstrologers(limit: number = 20): Promise<AstrologerDocument[]> {
    return this.astrologerModel
      .find({
        accountStatus: 'active',
        'verification.isVerified': true,
        status: 'online'
      })
      .sort({ 'stats.rating': -1, lastOnlineAt: -1 })
      .limit(limit)
      .populate('userId', 'name profileImage lastActiveAt')
      .exec();
  }

  async getAstrologersBySpecialization(specialization: string, limit: number = 10): Promise<AstrologerDocument[]> {
    return this.astrologerModel
      .find({
        accountStatus: 'active',
        'verification.isVerified': true,
        specializations: specialization
      })
      .sort({ 'stats.rating': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .populate('userId', 'name profileImage')
      .exec();
  }

  async getRandomAstrologers(limit: number = 5): Promise<AstrologerDocument[]> {
    return this.astrologerModel.aggregate([
      {
        $match: {
          accountStatus: 'active',
          'verification.isVerified': true,
          'stats.rating': { $gte: 3.0 }
        }
      },
      { $sample: { size: limit } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $addFields: {
          user: { $arrayElemAt: ['$user', 0] }
        }
      }
    ]);
  }
}
