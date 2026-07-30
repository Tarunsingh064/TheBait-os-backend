import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { InviteClientDto } from './dto/invite-client.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { TenantGuard } from '../tenants/tenant.guard';

@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Post('invite')
  @UseGuards(TenantGuard)
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteClientDto) {
    return this.clientsService.invite(user, dto);
  }

  @Get()
  @UseGuards(TenantGuard)
  @Roles('agency_owner', 'agency_member', 'agency_team_head')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.listClients(user);
  }

  // The person accepting hasn't logged in yet — they only have the token
  // from the invite link, so this route must be public.
  @Public()
  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.clientsService.acceptInvite(dto);
  }
}
