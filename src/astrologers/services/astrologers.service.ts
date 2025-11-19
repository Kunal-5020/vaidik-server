import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { UpdateAstrologerProfileDto } from '../dto/update-astrologer-profile.dto';
import { 
  SearchAstrologersDto, 
  SortByOption, 
  TopAstrologerTier,
  CountryOption 
} from '../dto/search-astrologers.dto';

export interface SearchResult {
  success: boolean;
  data: {
    astrologers: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    appliedFilters: {
      search?: string;
      skills?: string[];
      languages?: string[];
      genders?: string[];
      countries?: string[];
      topAstrologers?: string[];
      sortBy?: string;
      priceRange?: { minPrice?: number; maxPrice?: number };
      experienceRange?: { minExperience?: number; maxExperience?: number };
      minRating?: number;
      isOnline?: boolean;
      isLive?: boolean;
    };
  };
}

@Injectable()
export class AstrologersService {
  constructor(
    @InjectModel(Astrologer.name) 
    public readonly astrologerModel: Model<AstrologerDocument>,
  ) {}

  // ✅ ADD THIS: Convert Buffer ObjectId to hex string
  private convertObjectIdToString(obj: any): any {
    if (!obj) return obj;

    // Handle Buffer-wrapped ObjectId
    if (obj.buffer && obj.buffer.type === 'Buffer' && Array.isArray(obj.buffer.data)) {
      return Buffer.from(obj.buffer.data).toString('hex');
    }

    // Handle direct Buffer
    if (Buffer.isBuffer(obj)) {
      return obj.toString('hex');
    }

    // Handle objects with _bsontype
    if (obj._bsontype === 'ObjectID' || obj._bsontype === 'ObjectId') {
      return obj.toString();
    }

    // If it's already a string
    if (typeof obj === 'string') {
      return obj;
    }

    return obj;
  }

  // ✅ ADD THIS: Serialize astrologers array
  private serializeAstrologers(astrologers: any[]): any[] {
    return astrologers.map(astro => {
      const plain = astro.toObject ? astro.toObject() : { ...astro };
      const serialized: any = {};
      
      for (const key in plain) {
        const value = plain[key];
        
        // Convert _id field
        if (key === '_id') {
          serialized[key] = this.convertObjectIdToString(value);
        }
        // Handle nested objects
        else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          serialized[key] = {};
          for (const nestedKey in value) {
            if (nestedKey === '_id' || nestedKey.endsWith('Id')) {
              serialized[key][nestedKey] = this.convertObjectIdToString(value[nestedKey]);
            } else {
              serialized[key][nestedKey] = value[nestedKey];
            }
          }
        }
        // Handle arrays
        else if (Array.isArray(value)) {
          serialized[key] = value.map(item => {
            if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
              const nestedObj: any = {};
              for (const nestedKey in item) {
                nestedObj[nestedKey] = this.convertObjectIdToString(item[nestedKey]);
              }
              return nestedObj;
            }
            return item;
          });
        }
        // Handle primitive values
        else {
          serialized[key] = value;
        }
      }
      
      return serialized;
    });
  }

  // ===== NEW ENHANCED SEARCH METHOD =====

  /**
   * Advanced search with all filters
   */
  async searchAstrologers(searchDto: SearchAstrologersDto): Promise<SearchResult> {
    const {
      search,
      skills,
      languages,
      genders,
      countries,
      topAstrologers,
      minPrice,
      maxPrice,
      minRating,
      minExperience,
      maxExperience,
      isOnline,
      isLive,
      chatEnabled,
      callEnabled,
      videoCallEnabled,
      sortBy = SortByOption.POPULARITY,
      page = 1,
      limit = 20
    } = searchDto;

    // Build base query - only active and profile-complete astrologers
    const query: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true
    };

    // Text search in name and bio
    if (search?.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { bio: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // Filter by skills/specializations
    if (skills && skills.length > 0) {
      query.specializations = { $in: skills };
    }

    // Filter by languages
    if (languages && languages.length > 0) {
      query.languages = { $in: languages };
    }

    // Filter by gender
    if (genders && genders.length > 0) {
      query.gender = { $in: genders };
    }

    // Filter by country (if you have country field in schema, otherwise skip)
    if (countries && countries.length > 0) {
      if (countries.includes(CountryOption.INDIA)) {
        // query.country = 'India';
      }
      if (countries.includes(CountryOption.OUTSIDE_INDIA)) {
        // query.country = { $ne: 'India' };
      }
    }

    // Filter by top astrologer tiers
    if (topAstrologers && topAstrologers.length > 0 && !topAstrologers.includes(TopAstrologerTier.ALL)) {
      const tierConditions: any[] = []; // ✅ Fixed: Properly typed array
      
      // Celebrity: Highest ratings and most orders
      if (topAstrologers.includes(TopAstrologerTier.CELEBRITY)) {
        tierConditions.push({
          'ratings.average': { $gte: 4.8 },
          'stats.totalOrders': { $gte: 1000 }
        });
      }
      
      // Top Choice: High repeat customers
      if (topAstrologers.includes(TopAstrologerTier.TOP_CHOICE)) {
        tierConditions.push({
          'ratings.average': { $gte: 4.5 },
          'stats.repeatCustomers': { $gte: 50 }
        });
      }
      
      // Rising Star: Growing demand (created in last 6 months)
      if (topAstrologers.includes(TopAstrologerTier.RISING_STAR)) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        tierConditions.push({
          'ratings.average': { $gte: 4.3 },
          'stats.totalOrders': { $gte: 100 },
          createdAt: { $gte: sixMonthsAgo }
        });
      }
      
      if (tierConditions.length > 0) {
        // Use $or for multiple tier conditions
        if (!query.$or) {
          query.$or = tierConditions;
        } else {
          // If $or already exists (from text search), combine with $and
          query.$and = [
            { $or: query.$or },
            { $or: tierConditions }
          ];
          delete query.$or;
        }
      }
    }

    // Filter by price range
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
      query['ratings.average'] = { $gte: minRating };
    }

    // Filter by experience range
    if (minExperience !== undefined || maxExperience !== undefined) {
      query.experienceYears = {};
      if (minExperience !== undefined) {
        query.experienceYears.$gte = minExperience;
      }
      if (maxExperience !== undefined) {
        query.experienceYears.$lte = maxExperience;
      }
    }

    // Filter by online status
    if (isOnline === true) {
      query['availability.isOnline'] = true;
      query['availability.isAvailable'] = true;
    }

    // Filter by live streaming status
    if (isLive === true) {
      query['availability.isLive'] = true;
    }

    // Filter by service availability
    if (chatEnabled === true) {
      query.isChatEnabled = true;
    }
    if (callEnabled === true) {
      query.isCallEnabled = true;
    }
    if (videoCallEnabled === true) {
      query.isLiveStreamEnabled = true;
    }

    // Build sort criteria based on sortBy option
    let sortCriteria: any = {};
    
    switch (sortBy) {
      case SortByOption.RATING_HIGH_LOW:
        sortCriteria = { 'ratings.average': -1, 'ratings.total': -1 };
        break;
      
      case SortByOption.PRICE_LOW_HIGH:
        sortCriteria = { 'pricing.chat': 1 };
        break;
      
      case SortByOption.PRICE_HIGH_LOW:
        sortCriteria = { 'pricing.chat': -1 };
        break;
      
      case SortByOption.EXP_HIGH_LOW:
        sortCriteria = { experienceYears: -1 };
        break;
      
      case SortByOption.EXP_LOW_HIGH:
        sortCriteria = { experienceYears: 1 };
        break;
      
      case SortByOption.ORDERS_HIGH_LOW:
        sortCriteria = { 'stats.totalOrders': -1 };
        break;
      
      case SortByOption.ORDERS_LOW_HIGH:
        sortCriteria = { 'stats.totalOrders': 1 };
        break;
      
      case SortByOption.POPULARITY:
      default:
        // Popularity: combination of online status, rating, and orders
        sortCriteria = { 
          'availability.isOnline': -1,
          'ratings.average': -1, 
          'stats.totalOrders': -1 
        };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query with parallel operations for better performance
    const [astrologers, total] = await Promise.all([
      this.astrologerModel
        .find(query)
        .select('name bio profilePicture gallery introAudio experienceYears specializations languages ratings pricing availability stats gender')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.astrologerModel.countDocuments(query).exec()
    ]);

    const serializedAstrologers = this.serializeAstrologers(astrologers);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        astrologers: serializedAstrologers,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        appliedFilters: {
          search,
          skills,
          languages,
          genders,
          countries,
          topAstrologers,
          sortBy,
          priceRange: minPrice !== undefined || maxPrice !== undefined ? { minPrice, maxPrice } : undefined,
          experienceRange: minExperience !== undefined || maxExperience !== undefined ? { minExperience, maxExperience } : undefined,
          minRating,
          isOnline,
          isLive
        }
      }
    };
  }

  /**
   * Get filter options with counts (for building dynamic filter UI)
   */
  async getFilterOptions(): Promise<any> {
    const baseMatch = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true
    };

    const [
      specializationsCount,
      languagesCount,
      genderCount,
      priceStats,
      experienceStats,
      statusCounts,
      tierCounts
    ] = await Promise.all([
      // Specializations with counts
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $unwind: '$specializations' },
        { $group: { _id: '$specializations', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Languages with counts
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $unwind: '$languages' },
        { $group: { _id: '$languages', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Gender distribution
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$gender', count: { $sum: 1 } } }
      ]),
      
      // Price statistics
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { 
          _id: null, 
          minPrice: { $min: '$pricing.chat' },
          maxPrice: { $max: '$pricing.chat' },
          avgPrice: { $avg: '$pricing.chat' }
        } }
      ]),
      
      // Experience statistics
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { 
          _id: null, 
          minExperience: { $min: '$experienceYears' },
          maxExperience: { $max: '$experienceYears' },
          avgExperience: { $avg: '$experienceYears' }
        } }
      ]),
      
      // Status counts
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: {
          _id: null,
          totalActive: { $sum: 1 },
          onlineCount: { 
            $sum: { $cond: [{ $eq: ['$availability.isOnline', true] }, 1, 0] } 
          },
          liveCount: { 
            $sum: { $cond: [{ $eq: ['$availability.isLive', true] }, 1, 0] } 
          }
        }}
      ]),
      
      // Tier counts
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            celebrity: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $gte: ['$ratings.average', 4.8] },
                      { $gte: ['$stats.totalOrders', 1000] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            topChoice: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $gte: ['$ratings.average', 4.5] },
                      { $gte: ['$stats.repeatCustomers', 50] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            risingStar: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $gte: ['$ratings.average', 4.3] },
                      { $gte: ['$stats.totalOrders', 100] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    return {
      success: true,
      data: {
        specializations: specializationsCount.map(s => ({ 
          value: s._id, 
          label: this.capitalizeFirstLetter(s._id),
          count: s.count 
        })),
        languages: languagesCount.map(l => ({ 
          value: l._id, 
          label: this.capitalizeFirstLetter(l._id),
          count: l.count 
        })),
        genders: genderCount.map(g => ({ 
          value: g._id, 
          label: this.capitalizeFirstLetter(g._id),
          count: g.count 
        })),
        priceRange: priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
        experienceRange: experienceStats[0] || { minExperience: 0, maxExperience: 0, avgExperience: 0 },
        statusCounts: statusCounts[0] || { totalActive: 0, onlineCount: 0, liveCount: 0 },
        tierCounts: tierCounts[0] || { celebrity: 0, topChoice: 0, risingStar: 0 }
      }
    };
  }

  /**
   * Get featured astrologers (high rated, popular)
   */
  async getFeaturedAstrologers(limit: number = 10): Promise<any> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'profileCompletion.isComplete': true,
        'ratings.average': { $gte: 4.0 },
        'ratings.total': { $gte: 10 }
      })
      .select('name bio profilePicture experienceYears specializations languages ratings pricing availability stats')
      .sort({ 'ratings.average': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: astrologers.length,
      data: this.serializeAstrologers(astrologers)
    };
  }

  /**
   * Get top rated astrologers
   */
  async getTopRatedAstrologers(limit: number = 10): Promise<any> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'profileCompletion.isComplete': true,
        'ratings.total': { $gte: 5 }
      })
      .select('name bio profilePicture experienceYears specializations languages ratings pricing availability stats')
      .sort({ 'ratings.average': -1, 'ratings.total': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: astrologers.length,
      data: this.serializeAstrologers(astrologers)
    };
  }

  /**
   * Get online astrologers
   */
  async getOnlineAstrologers(limit: number = 20): Promise<any> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'profileCompletion.isComplete': true,
        'availability.isOnline': true,
        'availability.isAvailable': true
      })
      .select('name bio profilePicture experienceYears specializations languages ratings pricing availability stats')
      .sort({ 'ratings.average': -1, 'availability.lastActive': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: astrologers.length,
      data: this.serializeAstrologers(astrologers)
    };
  }

  /**
   * Get astrologers by specialization
   */
  async getAstrologersBySpecialization(
    specialization: string,
    limit: number = 10
  ): Promise<any> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'profileCompletion.isComplete': true,
        specializations: { $regex: new RegExp(`^${specialization}$`, 'i') }
      })
      .select('name bio profilePicture experienceYears specializations languages ratings pricing availability stats')
      .sort({ 'ratings.average': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: astrologers.length,
      specialization,
      data: this.serializeAstrologers(astrologers)
    };
  }

  /**
   * Get random astrologers (for discovery)
   */
  async getRandomAstrologers(limit: number = 5): Promise<any> {
    const astrologers = await this.astrologerModel.aggregate([
      {
        $match: {
          accountStatus: 'active',
          'profileCompletion.isComplete': true,
          'ratings.average': { $gte: 3.0 }
        }
      },
      { $sample: { size: limit } },
      {
        $project: {
          name: 1,
          bio: 1,
          profilePicture: 1,
          experienceYears: 1,
          specializations: 1,
          languages: 1,
          ratings: 1,
          pricing: 1,
          availability: 1,
          stats: 1
        }
      }
    ]);

    return {
      success: true,
      count: astrologers.length,
      data: this.serializeAstrologers(astrologers)
    };
  }

  // ===== EXISTING PUBLIC METHODS (Keep all your existing methods below) =====

  async getApprovedAstrologers(
    page: number = 1,
    limit: number = 20,
    filters?: {
      specializations?: string[];
      languages?: string[];
      minRating?: number;
      isOnline?: boolean;
      sortBy?: 'rating' | 'experience' | 'price';
    }
  ): Promise<any> {
    const searchDto: Partial<SearchAstrologersDto> = {
      page,
      limit,
      skills: filters?.specializations,
      languages: filters?.languages,
      minRating: filters?.minRating,
      isOnline: filters?.isOnline,
      sortBy: filters?.sortBy === 'rating' 
        ? SortByOption.RATING_HIGH_LOW 
        : filters?.sortBy === 'experience'
        ? SortByOption.EXP_HIGH_LOW
        : filters?.sortBy === 'price'
        ? SortByOption.PRICE_LOW_HIGH
        : SortByOption.POPULARITY
    };

    return this.searchAstrologers(searchDto as SearchAstrologersDto);
  }

  async getAstrologerDetails(astrologerId: string): Promise<any> {
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    const astrologer = await this.astrologerModel
      .findOne({
        _id: astrologerId,
        accountStatus: 'active',
        'profileCompletion.isComplete': true
      })
      .select('-phoneNumber -email -fcmToken -fcmTokenUpdatedAt')
      .lean()
      .exec();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found or not available');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  async getLiveAstrologers(limit: number = 20): Promise<any> {
    const liveAstrologers = await this.astrologerModel
      .find({
        'availability.isLive': true,
        accountStatus: 'active',
        'profileCompletion.isComplete': true,
        isLiveStreamEnabled: true
      })
      .select('name profilePicture specializations ratings availability.liveStreamId availability.lastActive stats')
      .sort({ 'ratings.average': -1, 'availability.lastActive': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: liveAstrologers.length,
      data: liveAstrologers
    };
  }

  async getOwnProfile(astrologerId: string): Promise<any> {
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .populate('registrationId', 'ticketNumber status')
      .lean()
      .exec();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer
    };
  }

  async updateProfile(
    astrologerId: string,
    updateDto: UpdateAstrologerProfileDto
  ): Promise<any> {
    if (!Types.ObjectId.isValid(astrologerId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (astrologer.accountStatus !== 'active') {
      throw new BadRequestException('Your account is not active. Contact support.');
    }

    const updateFields: any = {};

    if (updateDto.bio !== undefined) updateFields.bio = updateDto.bio;
    if (updateDto.profilePicture !== undefined) updateFields.profilePicture = updateDto.profilePicture;
    if (updateDto.chatRate !== undefined) updateFields['pricing.chat'] = updateDto.chatRate;
    if (updateDto.callRate !== undefined) updateFields['pricing.call'] = updateDto.callRate;
    if (updateDto.videoCallRate !== undefined) updateFields['pricing.videoCall'] = updateDto.videoCallRate;
    if (updateDto.isChatEnabled !== undefined) updateFields.isChatEnabled = updateDto.isChatEnabled;
    if (updateDto.isCallEnabled !== undefined) updateFields.isCallEnabled = updateDto.isCallEnabled;

    updateFields.updatedAt = new Date();

    const updatedAstrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: updateFields },
      { new: true, lean: true }
    ).exec();

    if (!updatedAstrologer) {
      throw new NotFoundException('Astrologer not found after update');
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedAstrologer
    };
  }


  async getAstrologerByUserId(userId: string): Promise<AstrologerDocument | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }
    return this.astrologerModel.findOne({ userId }).exec();
  }

  async canLogin(astrologerId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(astrologerId)) {
      return false;
    }

    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('accountStatus')
      .lean()
      .exec();

    if (!astrologer) return false;

    return astrologer.accountStatus === 'active';
  }

  private capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}
