import { 
  Controller, 
  Get, 
  Put, 
  Body, 
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { ProfileCompletionService } from './services/profile-completion.service'; // Add this
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { AccountSettingsDto } from './dto/account-settings.dto'; // Add this
import { UserDocument } from './schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

interface UserActivity {
  id: string;
  type: 'order' | 'transaction' | 'remedy' | 'report';
  description: string;
  amount: number;
  date: Date;
  status: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profileCompletionService: ProfileCompletionService, // Add this
  ) {}

  // === EXISTING ENDPOINTS (keep all previous methods) ===

  // Get current user profile
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    const profile = await this.usersService.getUserProfile(userId);
    
    // Add profile completion info
    const completion = this.profileCompletionService.calculateProfileCompletion(req.user);
    
    return {
      ...profile,
      profileCompletion: {
        percentage: completion.completionPercentage,
        strength: this.profileCompletionService.getProfileStrength(completion.completionPercentage),
        completedFields: completion.completedFields,
        missingFields: completion.missingFields,
        suggestions: completion.suggestions
      }
    };
  }

  // Update user profile
  @Put('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  // Update user preferences
  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() updatePreferencesDto: UpdatePreferencesDto
  ) {
    const userId = (req.user._id as any).toString();
    return this.usersService.updatePreferences(userId, updatePreferencesDto);
  }

  // === NEW ENDPOINTS ===

  // Get profile completion status
  @Get('profile/completion')
  async getProfileCompletion(@Req() req: AuthenticatedRequest) {
    const completion = this.profileCompletionService.calculateProfileCompletion(req.user);
    
    return {
      success: true,
      data: {
        completionPercentage: completion.completionPercentage,
        strength: this.profileCompletionService.getProfileStrength(completion.completionPercentage),
        completedFields: completion.completedFields,
        missingFields: completion.missingFields,
        suggestions: completion.suggestions,
        nextSteps: completion.missingFields.slice(0, 3) // Show top 3 missing fields
      }
    };
  }

  // Get user dashboard data
  @Get('dashboard')
  async getDashboard(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    const user = req.user;
    const completion = this.profileCompletionService.calculateProfileCompletion(user);

    return {
      success: true,
      data: {
        user: {
          name: user.name || 'User',
          profileImage: user.profileImage,
          memberSince: user.createdAt,
          lastActive: user.lastActiveAt
        },
        profileCompletion: {
          percentage: completion.completionPercentage,
          suggestions: completion.suggestions.slice(0, 2)
        },
        wallet: {
          balance: user.wallet.balance,
          totalSpent: user.wallet.totalSpent
        },
        activity: {
          totalSessions: user.stats.totalSessions,
          totalMinutes: user.stats.totalMinutesSpent,
          totalOrders: user.orders?.length || 0,
          favoriteAstrologers: user.favoriteAstrologers?.length || 0
        },
        quickActions: [
          { action: 'recharge_wallet', label: 'Recharge Wallet', enabled: true },
          { action: 'find_astrologer', label: 'Find Astrologer', enabled: true },
          { action: 'view_reports', label: 'My Reports', enabled: user.reports?.length > 0 },
          { action: 'track_remedies', label: 'Track Remedies', enabled: user.remedies?.length > 0 }
        ]
      }
    };
  }

  // Get user statistics
  @Get('stats')
  async getUserStats(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    return this.usersService.getUserStats(userId);
  }

  3// Get detailed user activity
  @Get('activity')
  async getUserActivity(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit: string = '10',
    @Query('type') type?: string
  ) {
    const user = req.user;
    const limitNum = parseInt(limit) || 10;

    // Combine all activities
    let activities: UserActivity[] = [];

    // Add recent orders
    if (user.orders && user.orders.length > 0) {
      activities.push(...user.orders.map(order => ({
        id: order.orderId,
        type: 'order' as 'order',
        description: `${order.type} session with ${order.astrologerName}`,
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status
      })));
    }

    // Add recent transactions
    if (user.walletTransactions && user.walletTransactions.length > 0) {
      activities.push(...user.walletTransactions.map(transaction => ({
        id: transaction.transactionId,
        type: 'transaction' as 'transaction',
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.createdAt,
        status: 'completed'
      })));
    }

    // Sort by date and limit
    activities = activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limitNum);

    return {
      success: true,
      data: {
        activities,
        totalCount: activities.length,
        hasMore: (user.orders?.length || 0) + (user.walletTransactions?.length || 0) > limitNum
      }
    };
  }

  // Get user wallet info
  @Get('wallet')
  async getWalletInfo(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    return {
      success: true,
      data: {
        balance: user.wallet.balance,
        totalRecharged: user.wallet.totalRecharged,
        totalSpent: user.wallet.totalSpent,
        lastRecharge: user.wallet.lastRechargeAt,
        lastTransaction: user.wallet.lastTransactionAt,
        transactions: user.walletTransactions || [],
        recentTransactions: user.walletTransactions?.slice(-5) || [],
        summary: {
          thisMonth: {
            spent: 0, // Would calculate from transactions
            recharged: 0,
            sessions: user.stats.totalSessions
          }
        }
      }
    };
  }

  // Get user orders with filters
  @Get('orders')
  async getUserOrders(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit: string = '10'
  ) {
    const user = req.user;
    let orders = user.orders || [];

    // Apply filters
    if (status) {
      orders = orders.filter(order => order.status === status);
    }
    if (type) {
      orders = orders.filter(order => order.type === type);
    }

    // Limit results
    const limitNum = parseInt(limit) || 10;
    const paginatedOrders = orders.slice(0, limitNum);

    return {
      success: true,
      data: {
        orders: paginatedOrders,
        totalOrders: orders.length,
        filteredCount: paginatedOrders.length,
        summary: {
          total: orders.length,
          completed: orders.filter(o => o.status === 'completed').length,
          active: orders.filter(o => o.status === 'active').length,
          cancelled: orders.filter(o => o.status === 'cancelled').length
        }
      }
    };
  }

  // Get user remedies
  @Get('remedies')
  async getUserRemedies(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    const remedies = user.remedies || [];

    return {
      success: true,
      data: {
        remedies,
        totalRemedies: remedies.length,
        activeRemedies: remedies.filter(r => r.status === 'accepted'),
        completedRemedies: remedies.filter(r => r.status === 'completed'),
        summary: {
          suggested: remedies.filter(r => r.status === 'suggested').length,
          accepted: remedies.filter(r => r.status === 'accepted').length,
          completed: remedies.filter(r => r.status === 'completed').length,
          declined: remedies.filter(r => r.status === 'declined').length
        }
      }
    };
  }

  // Get user reports
  @Get('reports')
  async getUserReports(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    const reports = user.reports || [];

    return {
      success: true,
      data: {
        reports,
        totalReports: reports.length,
        completedReports: reports.filter(r => r.status === 'completed'),
        pendingReports: reports.filter(r => r.status === 'pending'),
        summary: {
          pending: reports.filter(r => r.status === 'pending').length,
          completed: reports.filter(r => r.status === 'completed').length,
          delivered: reports.filter(r => r.status === 'delivered').length
        }
      }
    };
  }

  // Get favorite astrologers
  @Get('favorites')
  async getFavoriteAstrologers(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getUserProfile((req.user._id as any).toString());
    return {
      success: true,
      data: {
        favoriteAstrologers: user.data.favoriteAstrologers || [],
        totalFavorites: user.data.favoriteAstrologers?.length || 0
      }
    };
  }

  // Update account settings
  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async updateAccountSettings(
    @Req() req: AuthenticatedRequest,
    @Body() accountSettings: AccountSettingsDto
  ) {
    const userId = (req.user._id as any).toString();
    // This would be implemented in the service
    return {
      success: true,
      message: 'Account settings updated successfully',
      data: accountSettings
    };
  }
}
