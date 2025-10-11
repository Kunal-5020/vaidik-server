import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RemediesService } from '../services/remedies.service';
import { CreateRemedyDto } from '../dto/create-remedy.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; astrologerId?: string; name?: string };
}

@Controller('astrologer/remedies')
@UseGuards(JwtAuthGuard)
export class AstrologerRemediesController {
  constructor(private remediesService: RemediesService) {}

  // Create remedy for user
  @Post()
  async createRemedy(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) createDto: CreateRemedyDto
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;
    const astrologerName = req.user.name || 'Astrologer';

    return this.remediesService.createRemedy(
      astrologerId,
      astrologerName,
      createDto
    );
  }

  // Get astrologer's remedies
  @Get()
  async getRemedies(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    const astrologerId = req.user.astrologerId || req.user._id;

    return this.remediesService.getAstrologerRemedies(
      astrologerId,
      page,
      limit,
      { status, type }
    );
  }

  // Get remedy statistics
  @Get('stats/summary')
  async getRemedyStats(@Req() req: AuthenticatedRequest) {
    const astrologerId = req.user.astrologerId || req.user._id;
    return this.remediesService.getAstrologerRemedyStats(astrologerId);
  }
}
