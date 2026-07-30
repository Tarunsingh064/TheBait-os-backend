import { Controller, Get, Param, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { InviteCodesService } from './invite-codes.service';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { InviteCodeKind } from '../schemas/invite-code.schema';

const VALID_KINDS: InviteCodeKind[] = ['agency_member', 'client'];

@Controller('invite-codes')
@UseGuards(TenantGuard)
@Roles('agency_owner')
export class InviteCodesController {
  constructor(private inviteCodesService: InviteCodesService) {}

  @Get()
  getCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.inviteCodesService.getOrCreateCodes(user);
  }

  @Post(':kind/regenerate')
  regenerate(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    if (!VALID_KINDS.includes(kind as InviteCodeKind)) {
      throw new BadRequestException('kind must be "agency_member" or "client"');
    }
    return this.inviteCodesService.regenerate(user, kind as InviteCodeKind);
  }
}
