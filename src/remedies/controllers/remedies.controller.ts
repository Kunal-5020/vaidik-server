import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RemediesService } from '../services/remedies.service';
import { UpdateRemedyStatusDto } from '../dto/update-remedy-status.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('remedies')
@UseGuards(JwtAuthGuard)
export class RemediesController {
  private readonly logger = new Logger(RemediesController.name);

  constructor(private remediesService: RemediesService) {}

  /**
   * GET /api/v1/remedies/stats/summary
   * Get remedy statistics
   * ⚠️ MUST BE BEFORE :remedyId
   */
  @Get('stats/summary')
  async getRemedyStats(@Req() req: AuthenticatedRequest) {
    this.logger.log(`Fetching remedy stats for user: ${req.user._id}`);
    return this.remediesService.getUserRemedyStats(req.user._id);
  }

  /**
   * GET /api/v1/remedies/suggested
   * Tab 1: Get suggested (not purchased) remedies
   * ⚠️ MUST BE BEFORE :remedyId
   */
  @Get('suggested')
  async getSuggestedRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching suggested remedies for user: ${req.user._id}`);
    const safeLimit = Math.min(limit, 100);

    return this.remediesService.getSuggestedRemedies(
      req.user._id,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/remedies/purchased
   * Tab 2: Get purchased remedies
   * ⚠️ MUST BE BEFORE :remedyId
   */
  @Get('purchased')
  async getPurchasedRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Fetching purchased remedies for user: ${req.user._id}`);
    const safeLimit = Math.min(limit, 100);

    return this.remediesService.getPurchasedRemedies(
      req.user._id,
      page,
      safeLimit,
    );
  }

  /**
   * GET /api/v1/remedies/orders-with-remedies
   * Tab 3: Get list of orders that have remedy suggestions
   * ⚠️ MUST BE BEFORE :remedyId
   */
  @Get('orders-with-remedies')
  async getOrdersWithRemedies(@Req() req: AuthenticatedRequest) {
    this.logger.log(
      `Fetching orders with remedies for user: ${req.user._id}`,
    );

    return this.remediesService.getOrdersWithRemedies(req.user._id);
  }

  /**
   * GET /api/v1/remedies/by-order/:orderId
   * Get remedies suggested in specific order ONLY
   */
  @Get('by-order/:orderId')
  async getRemediesByOrder(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(
      `Fetching remedies for order ${orderId}, user: ${req.user._id}`,
    );
    const safeLimit = Math.min(limit, 100);

    return this.remediesService.getRemediesByOrder(
      orderId,
      req.user._id,
      page,
      safeLimit,
    );
  }

  // ========================================================
  // ⚠️ DYNAMIC ROUTES (LIKE :remedyId) MUST BE AT THE BOTTOM
  // ========================================================

  /**
   * GET /api/v1/remedies
   * Get all remedies for user (across all orders)
   */
  @Get()
  async getRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    this.logger.log(`Fetching remedies for user: ${req.user._id}`);
    const safeLimit = Math.min(limit, 100);

    return this.remediesService.getUserRemedies(
      req.user._id,
      page,
      safeLimit,
      { status, type },
    );
  }

  /**
   * GET /api/v1/remedies/:remedyId
   * Get single remedy details
   */
  @Get(':remedyId')
  async getRemedyDetails(
    @Param('remedyId') remedyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log(`Fetching remedy: ${remedyId}`);
    return this.remediesService.getRemedyDetails(remedyId, req.user._id);
  }

  /**
   * PATCH /api/v1/remedies/:remedyId/status
   * Accept/Reject remedy
   */
  @Patch(':remedyId/status')
  async updateRemedyStatus(
    @Param('remedyId') remedyId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: UpdateRemedyStatusDto,
  ) {
    this.logger.log(
      `Updating remedy status: ${remedyId} → ${dto.status}`,
    );

    return this.remediesService.updateRemedyStatus(
      remedyId,
      req.user._id,
      dto,
    );
  }
}