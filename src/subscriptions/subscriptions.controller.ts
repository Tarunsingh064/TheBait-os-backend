import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { BillingAccessGuard } from './billing-access.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  // Plan catalog is shown on a pricing page before signup, so it's public.
  @Public()
  @Get('plans')
  listPlans() {
    return this.subscriptionsService.listPlans();
  }

  @Get('current')
  @UseGuards(TenantGuard)
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getCurrent(user);
  }

  // BillingAccessGuard replaces a plain @Roles('agency_owner') here — the
  // owner can delegate this to a team head via hasBillingAccess.
  @Post()
  @UseGuards(TenantGuard, BillingAccessGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(user, dto);
  }

  @Post('cancel')
  @UseGuards(TenantGuard, BillingAccessGuard)
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.cancel(user);
  }
}
