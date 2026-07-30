import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';

@Controller('meetings')
@UseGuards(TenantGuard,SubscriptionGuard)
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Post()
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeetingDto) {
    return this.meetingsService.create(user, dto);
  }

  @Get()
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.meetingsService.findAll(user);
  }

  @Get(':id')
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meetingsService.findOne(user, id);
  }

  @Post(':id/retry')
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meetingsService.retry(user, id);
  }
}
