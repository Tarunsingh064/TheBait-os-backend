import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AgenciesService } from './agencies.service';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { BillingAccessGuard } from '../subscriptions/billing-access.guard';

@Controller('agencies')
@UseGuards(TenantGuard)
export class AgenciesController {
  constructor(private agenciesService: AgenciesService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.agenciesService.getMine(user);
  }

  // Reuses BillingAccessGuard from the subscriptions module — bank details
  // and payment links are the same sensitivity tier as billing, so the same
  // owner-or-delegated-team-head rule applies here.
  @Patch('me')
  @UseGuards(BillingAccessGuard)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBusinessInfoDto) {
    return this.agenciesService.updateMine(user, dto);
  }
}