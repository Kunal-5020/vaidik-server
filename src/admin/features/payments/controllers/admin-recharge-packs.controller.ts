import { Controller, Get, Post, Delete, Body, Param, UseGuards, Put } from '@nestjs/common';
import { WalletService } from '../../../../payments/services/wallet.service';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../../../admin/core/decorators/permissions.decorator';
import { Permissions } from '../../../../admin/core/config/permissions.config';

@Controller('admin/payments/recharge-packs')
@UseGuards(JwtAuthGuard) // Add RolesGuard if needed
export class AdminRechargePacksController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getAll() {
    const packs = await this.walletService.getAllRechargePacks();
    return { success: true, data: packs };
  }

  @Post()
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async savePack(@Body() body: { amount: number; bonusPercentage: number; isPopular: boolean; isActive: boolean }) {
    const pack = await this.walletService.saveRechargePack(body);
    return { success: true, message: 'Recharge pack saved', data: pack };
  }

  @Delete(':amount')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async deletePack(@Param('amount') amount: string) {
    await this.walletService.deleteRechargePack(Number(amount));
    return { success: true, message: 'Recharge pack deleted' };
  }
}