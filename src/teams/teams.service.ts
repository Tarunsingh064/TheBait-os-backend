import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Team, TeamDocument } from '../schemas/team.schema';
import { User, UserDocument, STAFF_ROLES } from '../schemas/user.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateTeamDto) {
    const { agencyId } = scopeToTenant(user);
    return this.teamModel.create({
      agencyId,
      name: dto.name,
      description: dto.description ?? '',
      memberIds: [],
      createdBy: new Types.ObjectId(user.userId),
    });
  }

  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    return this.teamModel.find({ agencyId }).sort({ createdAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const team = await this.teamModel.findOne({ _id: id, agencyId }).lean();
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  /**
   * Only agency staff (owner/member) can be added to a team — a client
   * being assignable to internal tasks would be a serious mix-up, so this
   * is checked here rather than trusted from the request.
   */
  async addMember(user: AuthenticatedUser, teamId: string, memberUserId: string) {
    const { agencyId } = scopeToTenant(user);
    const team = await this.teamModel.findOne({ _id: teamId, agencyId });
    if (!team) throw new NotFoundException('Team not found');

    const member = await this.userModel.findOne({ _id: memberUserId, agencyId });
    if (!member || !STAFF_ROLES.includes(member.role)) {
      throw new BadRequestException('Only agency staff in this agency can be added to a team');
    }

    if (!team.memberIds.some((id) => id.toString() === memberUserId)) {
      team.memberIds.push(new Types.ObjectId(memberUserId));
      await team.save();
    }
    return team;
  }

  async removeMember(user: AuthenticatedUser, teamId: string, memberUserId: string) {
    const { agencyId } = scopeToTenant(user);
    const team = await this.teamModel.findOne({ _id: teamId, agencyId });
    if (!team) throw new NotFoundException('Team not found');

    team.memberIds = team.memberIds.filter((id) => id.toString() !== memberUserId);
    await team.save();
    return team;
  }

  /**
   * Sets which team member is the "head" — must already be a member of
   * this team AND already hold the agency_team_head role (promoted by the
   * owner via UsersService.promoteToTeamHead). Passing null clears the head.
   */
  async setHead(user: AuthenticatedUser, teamId: string, headUserId: string | null) {
    const { agencyId } = scopeToTenant(user);
    const team = await this.teamModel.findOne({ _id: teamId, agencyId });
    if (!team) throw new NotFoundException('Team not found');

    if (headUserId === null) {
      team.headUserId = null;
      await team.save();
      return team;
    }

    const isMember = team.memberIds.some((id) => id.toString() === headUserId);
    if (!isMember) {
      throw new BadRequestException('The team head must already be a member of this team');
    }

    const candidate = await this.userModel.findOne({ _id: headUserId, agencyId });
    if (!candidate || candidate.role !== 'agency_team_head') {
      throw new BadRequestException(
        'This person must hold the agency_team_head role before being set as a team head — promote them first',
      );
    }

    team.headUserId = new Types.ObjectId(headUserId);
    await team.save();
    return team;
  }

  async remove(user: AuthenticatedUser, teamId: string) {
    const { agencyId } = scopeToTenant(user);
    const result = await this.teamModel.deleteOne({ _id: teamId, agencyId });
    if (result.deletedCount === 0) throw new NotFoundException('Team not found');
    return { deleted: true };
  }

  /** Used by the frontend's assignee picker — staff only, never clients. */
  async listAssignableStaff(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    return this.userModel
      .find({ agencyId, role: { $in: STAFF_ROLES } })
      .select('name email role')
      .lean();
  }
}
