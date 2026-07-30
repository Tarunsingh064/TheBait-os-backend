import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ClientInvite, ClientInviteDocument } from '../schemas/client-invite.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { InviteClientDto } from './dto/invite-client.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FREE_PLAN_CLIENT_LIMIT = 1;

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(ClientInvite.name) private inviteModel: Model<ClientInviteDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private subscriptionsService: SubscriptionsService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Creates an invite record and returns the raw token so the caller (the
   * controller) can hand it back as a link. There's no email sending here —
   * wire that in later; until then, the agency owner copies the link and
   * sends it manually.
   */
  async invite(user: AuthenticatedUser, dto: InviteClientDto) {
    const { agencyId } = scopeToTenant(user);

    // Free plan: 1 client total (active + pending invites combined) — this
    // is the "try the whole workflow once, free" ceiling. Paid plans skip
    // this check entirely via isActive().
    const isSubscribed = await this.subscriptionsService.isActive(agencyId.toString());
    if (!isSubscribed) {
      const [activeClientCount, pendingInviteCount] = await Promise.all([
        this.userModel.countDocuments({ agencyId, role: 'client' }),
        this.inviteModel.countDocuments({ agencyId, acceptedAt: null, expiresAt: { $gt: new Date() } }),
      ]);
      if (activeClientCount + pendingInviteCount >= FREE_PLAN_CLIENT_LIMIT) {
        throw new ForbiddenException(
          `Free plan is limited to ${FREE_PLAN_CLIENT_LIMIT} client. Upgrade at /dashboard/billing to invite more.`,
        );
      }
    }

    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.inviteModel.create({
      agencyId,
      email: dto.email,
      name: dto.name,
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    return { inviteToken: rawToken };
  }

  async listClients(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const [activeClients, pendingInvites] = await Promise.all([
      this.userModel.find({ agencyId, role: 'client' }).select('-passwordHash').lean(),
      this.inviteModel.find({ agencyId, acceptedAt: null, expiresAt: { $gt: new Date() } }).lean(),
    ]);
    return { activeClients, pendingInvites };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const tokenHash = this.hashToken(dto.token);
    const invite = await this.inviteModel.findOne({ tokenHash });

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      email: invite.email,
      name: invite.name,
      passwordHash,
      authProvider: 'local',
      role: 'client',
      agencyId: invite.agencyId,
    });

    invite.acceptedAt = new Date();
    await invite.save();

    return { userId: user._id.toString() };
  }
}
