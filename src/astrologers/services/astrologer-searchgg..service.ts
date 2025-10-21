import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { 
  SearchAstrologersDto, 
  SortByOption, 
  TopAstrologerTier,
  CountryOption 
} from '../dto/search-astrologers.dto';

export interface SearchResult {
  astrologers: any[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  appliedFilters: any;
}

@Injectable()
export class AstrologerSearchService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  // ✅ FINAL FIX: Convert Buffer ObjectId to hex string
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

  private serializeAstrologers(astrologers: any[]): any[] {
    return astrologers.map(astro => {
      // Get plain object
      const plain = astro.toObject ? astro.toObject() : { ...astro };
      
      // Recursively convert all properties
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
            serialized[key][nestedKey] = this.convertObjectIdToString(value[nestedKey]);
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

    const query: any = {
      accountStatus: 'active',
    };

    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { bio: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    if (skills && skills.length > 0) {
      query.specializations = { $in: skills };
    }

    if (languages && languages.length > 0) {
      query.languages = { $in: languages };
    }

    if (genders && genders.length > 0) {
      query.gender = { $in: genders };
    }

    if (topAstrologers && topAstrologers.length > 0 && !topAstrologers.includes(TopAstrologerTier.ALL)) {
      const tierConditions: any[] = [];
      
      if (topAstrologers.includes(TopAstrologerTier.CELEBRITY)) {
        tierConditions.push({
          'ratings.average': { $gte: 4.8 },
          'stats.totalOrders': { $gte: 1000 }
        });
      }
      
      if (topAstrologers.includes(TopAstrologerTier.TOP_CHOICE)) {
        tierConditions.push({
          'ratings.average': { $gte: 4.5 },
          'stats.repeatCustomers': { $gte: 50 }
        });
      }
      
      if (topAstrologers.includes(TopAstrologerTier.RISING_STAR)) {
        tierConditions.push({
          'ratings.average': { $gte: 4.3 },
          'stats.totalOrders': { $gte: 100 },
          createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
        });
      }
      
      if (tierConditions.length > 0) {
        query.$and = query.$and || [];
        query.$and.push({ $or: tierConditions });
      }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query['pricing.chat'] = {};
      if (minPrice !== undefined) query['pricing.chat'].$gte = minPrice;
      if (maxPrice !== undefined) query['pricing.chat'].$lte = maxPrice;
    }

    if (minRating !== undefined) {
      query['ratings.average'] = { $gte: minRating };
    }

    if (minExperience !== undefined || maxExperience !== undefined) {
      query.experienceYears = {};
      if (minExperience !== undefined) query.experienceYears.$gte = minExperience;
      if (maxExperience !== undefined) query.experienceYears.$lte = maxExperience;
    }

    if (isOnline === true) {
      query['availability.isOnline'] = true;
    }

    if (isLive === true) {
      query['availability.isLive'] = true;
    }

    if (chatEnabled === true) {
      query.isChatEnabled = true;
    }
    if (callEnabled === true) {
      query.isCallEnabled = true;
    }

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
        sortCriteria = { 
          'availability.isOnline': -1,
          'ratings.average': -1, 
          'stats.totalOrders': -1 
        };
    }

    const skip = (page - 1) * limit;

    const [astrologers, totalCount] = await Promise.all([
      this.astrologerModel
        .find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .select('-fcmToken')
        .exec(),
      this.astrologerModel.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // ✅ Serialize with Buffer conversion
    const serializedAstrologers = this.serializeAstrologers(astrologers);

    console.log('✅ First astrologer _id:', serializedAstrologers[0]?._id);
    console.log('✅ Type:', typeof serializedAstrologers[0]?._id);

    return {
      astrologers: serializedAstrologers,
      totalCount,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      appliedFilters: {
        search,
        skills,
        languages,
        genders,
        countries,
        topAstrologers,
        sortBy,
        priceRange: minPrice || maxPrice ? { minPrice, maxPrice } : undefined,
        experienceRange: minExperience || maxExperience ? { minExperience, maxExperience } : undefined,
        minRating,
        isOnline,
        isLive
      }
    };
  }

  // Apply to other methods...
  async getFeaturedAstrologers(limit: number = 10): Promise<any[]> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'ratings.average': { $gte: 4.0 },
        'ratings.total': { $gte: 10 }
      })
      .sort({ 'ratings.average': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .exec();

    return this.serializeAstrologers(astrologers);
  }

  async getTopRatedAstrologers(limit: number = 10): Promise<any[]> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'ratings.total': { $gte: 5 }
      })
      .sort({ 'ratings.average': -1, 'ratings.total': -1 })
      .limit(limit)
      .exec();

    return this.serializeAstrologers(astrologers);
  }

  async getOnlineAstrologers(limit: number = 20): Promise<any[]> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        'availability.isOnline': true
      })
      .sort({ 'ratings.average': -1, 'availability.lastActive': -1 })
      .limit(limit)
      .exec();

    return this.serializeAstrologers(astrologers);
  }

  async getAstrologersBySpecialization(
    specialization: string, 
    limit: number = 10
  ): Promise<any[]> {
    const astrologers = await this.astrologerModel
      .find({
        accountStatus: 'active',
        specializations: specialization
      })
      .sort({ 'ratings.average': -1, 'stats.totalOrders': -1 })
      .limit(limit)
      .exec();

    return this.serializeAstrologers(astrologers);
  }

  async getRandomAstrologers(limit: number = 5): Promise<any[]> {
    const astrologers = await this.astrologerModel.aggregate([
      {
        $match: {
          accountStatus: 'active',
          'ratings.average': { $gte: 3.0 }
        }
      },
      { $sample: { size: limit } }
    ]);

    return this.serializeAstrologers(astrologers);
  }
}
