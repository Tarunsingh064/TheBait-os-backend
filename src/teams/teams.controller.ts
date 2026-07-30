import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamMemberDto } from './dto/team-member.dto';
import { SetTeamHeadDto } from './dto/set-team-head.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';


// Staff-only end to end — clients never see or interact with teams/tasks.
@Controller('teams')
@UseGuards(TenantGuard, SubscriptionGuard)
@Roles('agency_owner', 'agency_member', 'agency_team_head')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.teamsService.findAll(user);
  }

  @Get('assignable-staff')
  listAssignableStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.teamsService.listAssignableStaff(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamsService.findOne(user, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: TeamMemberDto) {
    return this.teamsService.addMember(user, id, dto.userId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.teamsService.removeMember(user, id, userId);
  }

  // Only the owner decides who heads a team — narrower than the class-level
  // @Roles() above, and @Roles() at method level overrides it.
  @Patch(':id/head')
  @Roles('agency_owner')
  setHead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetTeamHeadDto) {
    return this.teamsService.setHead(user, id, dto.headUserId ?? null);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamsService.remove(user, id);
  }
}
