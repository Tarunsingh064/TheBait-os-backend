import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { SetBillingAccessDto } from './dto/set-billing-access.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Protected by the global JwtAuthGuard (no @Public here) — this is what
  // the frontend AuthContext calls on load to know who's signed in and
  // which section (dashboard/portal/admin) to render.
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('agency-members')
  @UseGuards(TenantGuard)
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  listAgencyMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listAgencyMembers(user);
  }

  @Patch('agency-members/:id/promote')
  @UseGuards(TenantGuard)
  @Roles('agency_owner')
  promote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.promoteToTeamHead(user, id);
  }

  @Patch('agency-members/:id/demote')
  @UseGuards(TenantGuard)
  @Roles('agency_owner')
  demote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.demoteTeamHead(user, id);
  }

  @Patch('agency-members/:id/billing-access')
  @UseGuards(TenantGuard)
  @Roles('agency_owner')
  setBillingAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetBillingAccessDto,
  ) {
    return this.usersService.setBillingAccess(user, id, dto.granted);
  }

  @Delete('agency-members/:id')
  @UseGuards(TenantGuard)
  @Roles('agency_owner')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.removeMember(user, id);
  }
}
