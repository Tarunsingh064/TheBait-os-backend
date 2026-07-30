import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, STAFF_ROLES } from '../schemas/user.schema';
import { Team, TeamDocument } from '../schemas/team.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
  ) {}

  // Example of the pattern every future module (projects, invoices, contracts...)
  // should copy: always run list/find queries through scopeToTenant, never
  // trust a client-supplied agencyId directly for non-superadmin roles.
  async listAgencyMembers(currentUser: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(currentUser);
    return this.userModel
      .find({ agencyId, role: { $in: STAFF_ROLES } })
      .select('-passwordHash')
      .sort({ role: 1, name: 1 })
      .lean();
  }

  /**
   * Owner-only. Promotes an existing agency_member to agency_team_head so
   * they become eligible to be set as a Team's head (TeamsService.setHead
   * enforces that eligibility check). Only ever moves member -> team_head,
   * never touches owner/client/superadmin accounts.
   */
  async promoteToTeamHead(currentUser: AuthenticatedUser, targetUserId: string) {
    const { agencyId } = scopeToTenant(currentUser);
    if (currentUser.userId === targetUserId) {
      throw new BadRequestException('You cannot change your own role');
    }

    const target = await this.userModel.findOne({ _id: targetUserId, agencyId });
    if (!target) throw new NotFoundException('Agency member not found');
    if (target.role !== 'agency_member') {
      throw new BadRequestException('Only an agency_member can be promoted to agency_team_head');
    }

    target.role = 'agency_team_head';
    await target.save();
    return target;
  }

  /**
   * Owner-only. Demotes a team head back to a regular member. Also clears
   * them as `headUserId` on any team they were heading — a team can't have
   * a head who no longer holds the role.
   */
  async demoteTeamHead(currentUser: AuthenticatedUser, targetUserId: string) {
    const { agencyId } = scopeToTenant(currentUser);
    const target = await this.userModel.findOne({ _id: targetUserId, agencyId });
    if (!target) throw new NotFoundException('Agency member not found');
    if (target.role !== 'agency_team_head') {
      throw new BadRequestException('This user is not currently a team head');
    }

    target.role = 'agency_member';
    target.hasBillingAccess = false; // a plain member can never hold billing access
    await target.save();

    await this.teamModel.updateMany({ agencyId, headUserId: target._id }, { headUserId: null });
    return target;
  }

  /**
   * Owner-only. Grants or revokes billing access for a team head —
   * BillingAccessGuard re-checks this from the database on every billing
   * request, so revoking here takes effect immediately, not on next login.
   * Only ever applies to agency_team_head; owner always has implicit access
   * and other roles can never be granted this.
   */
  async setBillingAccess(currentUser: AuthenticatedUser, targetUserId: string, granted: boolean) {
    const { agencyId } = scopeToTenant(currentUser);
    const target = await this.userModel.findOne({ _id: targetUserId, agencyId });
    if (!target) throw new NotFoundException('Agency member not found');
    if (target.role !== 'agency_team_head') {
      throw new BadRequestException('Only a team head can be granted billing access');
    }

    target.hasBillingAccess = granted;
    await target.save();
    return { hasBillingAccess: target.hasBillingAccess };
  }

  /**
   * Owner-only. Deactivates a staff account (soft — keeps their historical
   * data intact, e.g. tasks they created, invoices they issued) rather than
   * deleting the user outright.
   */
  async removeMember(currentUser: AuthenticatedUser, targetUserId: string) {
    const { agencyId } = scopeToTenant(currentUser);
    if (currentUser.userId === targetUserId) {
      throw new ForbiddenException('You cannot remove your own account');
    }
    const target = await this.userModel.findOne({ _id: targetUserId, agencyId });
    if (!target || target.role === 'agency_owner') {
      throw new BadRequestException('Cannot remove this account');
    }
    target.isActive = false;
    await target.save();
    return { deactivated: true };
  }
}
