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
import { User, UserDocument } from '../../users/schemas/user.schema';

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
    appliedFilters: any;
  };
}

@Injectable()
export class AstrologersService {
  constructor(
    @InjectModel(Astrologer.name) 
    public readonly astrologerModel: Model<AstrologerDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ✅ Helper: Get blocked astrologer IDs for a user
  private async getBlockedAstrologerIds(userId: string): Promise<Types.ObjectId[]> {
    if (!userId || !Types.ObjectId.isValid(userId)) return [];
    const user = await this.userModel.findById(userId).select('blockedAstrologers').lean().exec();
    if (!user?.blockedAstrologers?.length) return [];
    return user.blockedAstrologers.map(b => new Types.ObjectId(b.astrologerId as any));
  }

  private convertObjectIdToString(obj: any): any {
    if (obj?._bsontype === 'ObjectID') return obj.toString();
    return obj;
  }

  private serializeAstrologers(astrologers: any[]): any[] {
    // Simplified serialization for brevity - keep your existing implementation if it's working
    return astrologers.map(astro => {
        const doc = astro.toObject ? astro.toObject() : astro;
        if(doc._id) doc._id = doc._id.toString();
        return doc;
    });
  }

   /**
   * ✅ FIXED: Advanced search with proper AND/OR Logic
   */
  async searchAstrologers(
  searchDto: SearchAstrologersDto, 
  userId?: string
): Promise<SearchResult> {
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
    sortBy = 'popularity',
    page = 1,
    limit = 20
  } = searchDto;

  // 1. Base Filters (Active & Complete Profile)
  const andConditions: any[] = [
    { accountStatus: 'active' },
    { 'profileCompletion.isComplete': true }
  ];

  // 2. Exclude blocked astrologers
  if (userId) {
    const blockedIds = await this.getBlockedAstrologerIds(userId);
    if (blockedIds.length > 0) {
      andConditions.push({ _id: { $nin: blockedIds } });
    }
  }

  // 3. Search Text (Name OR Bio)
  if (search?.trim()) {
    const term = search.trim();
    andConditions.push({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { bio: { $regex: term, $options: 'i' } }
      ]
    });
  }

  // 4. Skills (FIXED: Uses partial match regex inside $elemMatch or $in)
  // This ensures 'vedic' matches 'Vedic Astrology'
  const skillsList = Array.isArray(skills) ? skills : (skills ? [skills] : []);
  if (skillsList.length > 0) {
    const skillRegexes = skillsList.map(s => new RegExp(s.trim(), 'i'));
    andConditions.push({
      specializations: { $in: skillRegexes }
    });
  }

  // 5. Languages (FIXED: Partial match)
  const langList = Array.isArray(languages) ? languages : (languages ? [languages] : []);
  if (langList.length > 0) {
    const langRegexes = langList.map(l => new RegExp(l.trim(), 'i'));
    andConditions.push({
      languages: { $in: langRegexes }
    });
  }

  // 6. Gender (Exact match is usually fine for gender)
  const genderList = Array.isArray(genders) ? genders : (genders ? [genders] : []);
  if (genderList.length > 0) {
    // Ensure case insensitivity for gender
    const genderRegexes = genderList.map(g => new RegExp(`^${g}$`, 'i'));
    andConditions.push({ gender: { $in: genderRegexes } });
  }

  // 7. Country (India vs Outside)
  const countryList = Array.isArray(countries) ? countries : (countries ? [countries] : []);
  if (countryList.length > 0) {
    const countryOrConditions: any[] = [];
    
    // Check for 'india'
    if (countryList.some(c => c.toLowerCase() === 'india')) {
      countryOrConditions.push({ country: { $regex: /india/i } });
    }
    
    // Check for 'outside-india'
    if (countryList.some(c => c.toLowerCase() === 'outside-india')) {
      countryOrConditions.push({ country: { $not: { $regex: /india/i } } });
    }

    if (countryOrConditions.length > 0) {
      andConditions.push({ $or: countryOrConditions });
    }
  }

 // 8. Top Astrologers Categories
    const tierList = Array.isArray(topAstrologers) 
      ? topAstrologers 
      : (topAstrologers ? [topAstrologers] : []);

    // ✅ FIX: Cast to string array to avoid Enum type conflicts
    const tiers = tierList as unknown as string[];

    if (tiers.length > 0 && !tiers.includes('all')) { 
       const tierOrConditions: any[] = [];

       if (tiers.includes('celebrity')) {
         tierOrConditions.push({ 
            $or: [
                { tier: 'celebrity' }, 
                { 'ratings.average': { $gte: 4.8 } } 
            ]
         });
       }
       
       if (tiers.includes('top-choice')) {
         tierOrConditions.push({ 
            $or: [
                { tier: 'top-choice' },
                { 'ratings.average': { $gte: 4.5 } }
            ]
         });
       }
       
       if (tiers.includes('rising-star')) {
         tierOrConditions.push({ 
            $or: [
                { tier: 'rising-star' },
                { 'stats.totalOrders': { $gte: 50 } }
            ]
         });
       }

       if (tierOrConditions.length > 0) {
         andConditions.push({ $or: tierOrConditions });
       }
    }

  // 9. Numeric Ranges
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceQuery: any = {};
    if (minPrice) priceQuery.$gte = Number(minPrice);
    if (maxPrice) priceQuery.$lte = Number(maxPrice);
    andConditions.push({ 'pricing.chat': priceQuery });
  }

  if (minRating) {
    andConditions.push({ 'ratings.average': { $gte: Number(minRating) } });
  }

  if (minExperience || maxExperience) {
    const expQuery: any = {};
    if (minExperience) expQuery.$gte = Number(minExperience);
    if (maxExperience) expQuery.$lte = Number(maxExperience);
    andConditions.push({ experienceYears: expQuery });
  }

  // 10. Status
  if (String(isOnline) === 'true') {
      andConditions.push({ 'availability.isOnline': true });
  }

  // Final Query
  const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};

  // 11. Sorting Logic
  let sortCriteria: any = {};
  
  switch (String(sortBy)) {
    case 'rating-high-low':
      sortCriteria = { 'ratings.average': -1, 'ratings.total': -1 };
      break;
    case 'price-low-high':
      sortCriteria = { 'pricing.chat': 1 };
      break;
    case 'price-high-low':
      sortCriteria = { 'pricing.chat': -1 };
      break;
    case 'exp-high-low':
      sortCriteria = { experienceYears: -1 };
      break;
    case 'exp-low-high':
      sortCriteria = { experienceYears: 1 };
      break;
    case 'orders-high-low':
      sortCriteria = { 'stats.totalOrders': -1 };
      break;
    case 'orders-low-high':
      sortCriteria = { 'stats.totalOrders': 1 };
      break;
    case 'popularity':
    default:
      // Mix of factors to show "best" first
      sortCriteria = { 
        'availability.isOnline': -1,  // Online first
        'ratings.average': -1,        // Then high rating
        'stats.totalOrders': -1       // Then total orders
      };
  }

  // Add secondary sort to prevent "jumping" items during pagination
  sortCriteria._id = 1; 


  const skip = (page - 1) * limit;

  const [astrologers, total] = await Promise.all([
    this.astrologerModel
      .find(finalQuery)
      .select('name bio profilePicture experienceYears specializations languages ratings pricing availability stats gender country tier')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    this.astrologerModel.countDocuments(finalQuery).exec()
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data: {
      astrologers: this.serializeAstrologers(astrologers),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      appliedFilters: searchDto
    }
  };
}


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
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $unwind: '$specializations' },
        { $group: { _id: '$specializations', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $unwind: '$languages' },
        { $group: { _id: '$languages', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$gender', count: { $sum: 1 } } }
      ]),
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { 
          _id: null, 
          minPrice: { $min: '$pricing.chat' },
          maxPrice: { $max: '$pricing.chat' },
          avgPrice: { $avg: '$pricing.chat' }
        } }
      ]),
      this.astrologerModel.aggregate([
        { $match: baseMatch },
        { $group: { 
          _id: null, 
          minExperience: { $min: '$experienceYears' },
          maxExperience: { $max: '$experienceYears' },
          avgExperience: { $avg: '$experienceYears' }
        } }
      ]),
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
  async getFeaturedAstrologers(limit: number = 10, userId?: string): Promise<any> {
    const query: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      'ratings.average': { $gte: 4.0 },
      'ratings.total': { $gte: 10 }
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        query._id = { $nin: blockedIds };
      }
    }

    const astrologers = await this.astrologerModel
      .find(query)
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
  async getTopRatedAstrologers(limit: number = 10, userId?: string): Promise<any> {
    const query: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      'ratings.total': { $gte: 5 }
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        query._id = { $nin: blockedIds };
      }
    }

    const astrologers = await this.astrologerModel
      .find(query)
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
  async getOnlineAstrologers(limit: number = 20, userId?: string): Promise<any> {
    const query: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      'availability.isOnline': true,
      'availability.isAvailable': true
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        query._id = { $nin: blockedIds };
      }
    }

    const astrologers = await this.astrologerModel
      .find(query)
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
    limit: number = 10,
    userId?: string
  ): Promise<any> {
    const query: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      specializations: { $regex: new RegExp(`^${specialization}$`, 'i') }
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        query._id = { $nin: blockedIds };
      }
    }

    const astrologers = await this.astrologerModel
      .find(query)
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
  async getRandomAstrologers(limit: number = 5, userId?: string): Promise<any> {
    const matchQuery: any = {
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      'ratings.average': { $gte: 3.0 }
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        matchQuery._id = { $nin: blockedIds };
      }
    }

    const astrologers = await this.astrologerModel.aggregate([
      { $match: matchQuery },
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

  async getApprovedAstrologers(
    page: number = 1,
    limit: number = 20,
    filters?: {
      specializations?: string[];
      languages?: string[];
      minRating?: number;
      isOnline?: boolean;
      sortBy?: 'rating' | 'experience' | 'price';
    },
    userId?: string
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

    return this.searchAstrologers(searchDto as SearchAstrologersDto, userId);
  }

  async getAstrologerDetails(astrologerId: string): Promise<any> {
    let validatedId: string;
    
    if (typeof astrologerId === 'object' && astrologerId !== null) {
      validatedId = this.convertObjectIdToString(astrologerId);
    } else {
      validatedId = astrologerId;
    }

    if (!Types.ObjectId.isValid(validatedId)) {
      throw new BadRequestException('Invalid astrologer ID format');
    }

    const astrologer = await this.astrologerModel
      .findOne({
        _id: validatedId,
        accountStatus: 'active',
        'profileCompletion.isComplete': true
      })
      .select('-phoneNumber -email -fcmToken -fcmTokenUpdatedAt')
      .lean()
      .exec();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found or not available');
    }

    const serialized = this.serializeAstrologers([astrologer])[0];

    return {
      success: true,
      data: serialized
    };
  }

  async getLiveAstrologers(limit: number = 20, userId?: string): Promise<any> {
    const query: any = {
      'availability.isLive': true,
      accountStatus: 'active',
      'profileCompletion.isComplete': true,
      isLiveStreamEnabled: true
    };

    // ✅ Filter blocked astrologers
    if (userId) {
      const blockedIds = await this.getBlockedAstrologerIds(userId);
      if (blockedIds.length > 0) {
        query._id = { $nin: blockedIds };
      }
    }

    const liveAstrologers = await this.astrologerModel
      .find(query)
      .select('name profilePicture specializations ratings availability.liveStreamId availability.lastActive stats')
      .sort({ 'ratings.average': -1, 'availability.lastActive': -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      count: liveAstrologers.length,
      data: this.serializeAstrologers(liveAstrologers)
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

    const serialized = this.serializeAstrologers([astrologer])[0];

    return {
      success: true,
      data: serialized
    };
  }

  async updateProfile(astrologerId: string, updateDto: UpdateAstrologerProfileDto) {
  try {
    console.log('📝 [AstrologersService] Updating profile:', {
      astrologerId,
      updateData: updateDto,
    });

    const astrologer = await this.astrologerModel.findById(astrologerId);

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // Update fields
    if (updateDto.name !== undefined) {
      astrologer.name = updateDto.name;
    }

    if (updateDto.bio !== undefined) {
      astrologer.bio = updateDto.bio;
    }

    if (updateDto.experienceYears !== undefined) {
      astrologer.experienceYears = updateDto.experienceYears;
    }

    if (updateDto.specializations !== undefined) {
      astrologer.specializations = updateDto.specializations;
      astrologer.profileCompletion.steps.expertise = 
        updateDto.specializations.length > 0 && 
        astrologer.languages && 
        astrologer.languages.length > 0;
    }

    if (updateDto.languages !== undefined) {
      astrologer.languages = updateDto.languages;
      astrologer.profileCompletion.steps.expertise = 
        updateDto.languages.length > 0 && 
        astrologer.specializations && 
        astrologer.specializations.length > 0;
    }

    if (updateDto.profilePicture !== undefined) {
      astrologer.profilePicture = updateDto.profilePicture;
    }

    if (updateDto.isChatEnabled !== undefined) {
      astrologer.isChatEnabled = updateDto.isChatEnabled;
    }

    if (updateDto.isCallEnabled !== undefined) {
      astrologer.isCallEnabled = updateDto.isCallEnabled;
    }

    // Check and update profile completion
    await this.checkAndUpdateProfileCompletion(astrologer);

    await astrologer.save();


    return {
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: astrologer._id,
        name: astrologer.name,
        bio: astrologer.bio,
        experienceYears: astrologer.experienceYears,
        specializations: astrologer.specializations,
        languages: astrologer.languages,
        profilePicture: astrologer.profilePicture,
        profileCompletion: astrologer.profileCompletion,
      },
    };
  } catch (error) {
    console.error('❌ [AstrologersService] Update error:', error);
    throw error;
  }
}

/**
 * Helper: Check and update profile completion
 */
private async checkAndUpdateProfileCompletion(astrologer: any): Promise<void> {
  const steps = astrologer.profileCompletion.steps;
  
  // Update basic info step
  steps.basicInfo = !!(
    astrologer.name && 
    astrologer.email && 
    astrologer.phoneNumber &&
    astrologer.gender &&
    astrologer.dateOfBirth
  );

  // Update expertise step
  steps.expertise = !!(
    astrologer.specializations?.length > 0 && 
    astrologer.languages?.length > 0
  );

  // Check if all steps are complete
  const allStepsComplete = Object.values(steps).every(step => step === true);

  if (allStepsComplete && !astrologer.profileCompletion.isComplete) {
    astrologer.profileCompletion.isComplete = true;
    astrologer.profileCompletion.completedAt = new Date();
    
    // Enable services once profile is complete
    astrologer.isChatEnabled = true;
    astrologer.isCallEnabled = true;
    astrologer.isLiveStreamEnabled = true;
  }
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
