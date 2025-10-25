import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrdersService } from '../services/orders.service';
import { AddReviewDto } from '../dto/add-review.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  // Get user's orders
  @Get()
  async getOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    const safeLimit = Math.min(limit, 100);

    return this.ordersService.getUserOrders(
      req.user._id,
      page,
      safeLimit,
      { type, status }
    );
  }

  // Get single order details
  @Get(':orderId')
  async getOrderDetails(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.ordersService.getOrderDetails(orderId, req.user._id);
  }

  // Add review to order
  @Post(':orderId/review')
  async addReview(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) reviewDto: AddReviewDto
  ) {
    return this.ordersService.addReview(
      orderId,
      req.user._id,
      reviewDto.rating,
      reviewDto.review
    );
  }

  // Cancel order
  @Patch(':orderId/cancel')
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) cancelDto: CancelOrderDto
  ) {
    return this.ordersService.cancelOrder(
      orderId,
      req.user._id,
      cancelDto.reason,
      'user'
    );
  }

  // Get order statistics
  @Get('stats/summary')
  async getOrderStats(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getUserOrderStats(req.user._id);
  }
}
