import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument } from '../schemas/user.schema';
import { Agency, AgencyDocument } from '../schemas/agency.schema';
import { RefreshToken, RefreshTokenDocument } from '../schemas/refresh-token.schema';
import { PasswordResetToken, PasswordResetTokenDocument } from '../schemas/password-reset-token.schema';
import { ClientAgencyLink, ClientAgencyLinkDocument } from '../schemas/client-agency-link.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JoinWithCodeDto } from './dto/Join-with-code.dto';
import { InviteCodesService } from '../invite-codes/invite-codes.service';

const ACCESS_TOKEN_TTL = '15d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TOKEN_TTL_STR = '30d';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — short-lived by design

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Agency.name) private agencyModel: Model<AgencyDocument>,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(PasswordResetToken.name) private resetTokenModel: Model<PasswordResetTokenDocument>,
    @InjectModel(ClientAgencyLink.name) private clientAgencyLinkModel: Model<ClientAgencyLinkDocument>,
    private inviteCodesService: InviteCodesService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    // SHA-256 is sufficient here (not a password — already high-entropy random JWT),
    // and lets us look tokens up by exact hash match instead of bcrypt-comparing every row.
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokenPair(user: UserDocument, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      agencyId: user.agencyId ? user.agencyId.toString() : null,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_TTL_STR,
    });

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const slug = this.slugify(dto.agencyName);

    // Create the owner user first (agencyId set after), then the agency,
    // then link them — avoids a chicken-and-egg required-field problem
    // without needing a transaction for this MVP (single-node Mongo may not support them).
    const user = await this.userModel.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'agency_owner',
      agencyId: null,
    });

    const agency = await this.agencyModel.create({
      name: dto.agencyName,
      slug: await this.uniqueSlug(slug),
      ownerId: user._id,
      status: 'trial',
    });

    user.agencyId = agency._id as Types.ObjectId;
    await user.save();

    return this.issueTokenPair(user, meta);
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const user = await this.userModel.findOne({ email: dto.email }).select('+passwordHash');
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      // Signed up via Google — no password to check against. Tell them
      // clearly rather than a generic "invalid password" that implies they
      // mistyped something.
      throw new UnauthorizedException('This account uses Google sign-in. Use "Continue with Google" instead.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.issueTokenPair(user, meta);
  }

  /**
   * Rotates a refresh token: the presented token is marked used and a new
   * pair is issued. If a token that was ALREADY marked used/revoked comes
   * back in, that's a signal of theft or replay — the entire chain for that
   * user is revoked, forcing a fresh login everywhere.
   */
  async refresh(userId: string, rawToken: string, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or not found');
    }

    if (stored.revoked) {
      // Reuse of a revoked/rotated-out token — treat as compromise.
      await this.refreshTokenModel.updateMany({ userId: stored.userId }, { revoked: true });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }

    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or no longer exists');
    }

    stored.revoked = true;
    const newPair = await this.issueTokenPair(user, meta);
    stored.replacedByHash = this.hashToken(newPair.refreshToken);
    await stored.save();

    return newPair;
  }

  async logout(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.refreshTokenModel.updateOne({ tokenHash }, { revoked: true });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany({ userId }, { revoked: true });
  }

  /**
   * Always returns the same generic response whether or not the email
   * exists — never reveal account existence via this endpoint (a classic
   * enumeration leak). The actual reset link is returned here for now since
   * there's no email sending wired up yet; swap for a real transactional
   * email provider before this goes live for real users.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; resetToken?: string }> {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user || !user.isActive) {
      return { message: 'If an account exists for this email, a reset link has been sent.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.resetTokenModel.create({
      userId: user._id,
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    // TODO: send this via a real email provider instead of returning it directly.
    return { message: 'If an account exists for this email, a reset link has been sent.', resetToken: rawToken };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.resetTokenModel.findOne({ tokenHash });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.userModel.updateOne({ _id: resetToken.userId }, { passwordHash });

    resetToken.usedAt = new Date();
    await resetToken.save();

    // A password reset is exactly the moment to invalidate every existing
    // session — if someone else had access, this locks them out too.
    await this.logoutAll(resetToken.userId.toString());
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new UnauthorizedException('Account not found');

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google sign-in and has no password to change. Use "Continue with Google" instead.',
      );
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await user.save();
  }

  /**
   * Handles both join-code kinds in one flow:
   * - agency_member code: creates a brand-new staff account for that agency.
   *   Rejects if the email is already in use anywhere (staff accounts are
   *   single-agency, so there's no "link to a second agency" concept here).
   * - client code: if the email already belongs to an existing CLIENT
   *   account, this LINKS that same client to the new agency (verifying
   *   the password proves they own the account) rather than creating a
   *   duplicate user — this is what makes "a client can belong to multiple
   *   agencies" actually work. If the email is brand new, creates a fresh
   *   client account linked to just this one agency.
   */
  async joinWithCode(dto: JoinWithCodeDto, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const inviteCode = await this.inviteCodesService.findByCode(dto.code);
    if (!inviteCode) {
      throw new BadRequestException('This join code is invalid');
    }

    const existing = await this.userModel.findOne({ email: dto.email }).select('+passwordHash');

    if (inviteCode.kind === 'agency_member') {
      if (existing) {
        throw new ConflictException(
          'An account with this email already exists. Log in instead, or ask your agency owner for access.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = await this.userModel.create({
        email: dto.email,
        name: dto.name,
        passwordHash,
        authProvider: 'local',
        role: 'agency_member',
        agencyId: inviteCode.agencyId,
      });
      return this.issueTokenPair(user, meta);
    }

    // kind === 'client'
    if (existing) {
      if (existing.role !== 'client') {
        throw new ConflictException(
          'An account with this email already exists and is not a client account.',
        );
      }
      if (!existing.passwordHash) {
        throw new BadRequestException(
          'This account uses Google sign-in — sign in with Google first, then add this agency from your portal.',
        );
      }
      const valid = await bcrypt.compare(dto.password, existing.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Incorrect password for this existing account');
      }

      await this.clientAgencyLinkModel.updateOne(
        { clientId: existing._id, agencyId: inviteCode.agencyId },
        { $setOnInsert: { clientId: existing._id, agencyId: inviteCode.agencyId } },
        { upsert: true },
      );

      // Switch their active session to the agency they just joined.
      existing.agencyId = inviteCode.agencyId as Types.ObjectId;
      existing.lastLoginAt = new Date();
      await existing.save();
      return this.issueTokenPair(existing, meta);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      authProvider: 'local',
      role: 'client',
      agencyId: inviteCode.agencyId,
    });
    await this.clientAgencyLinkModel.create({ clientId: user._id, agencyId: inviteCode.agencyId });
    return this.issueTokenPair(user, meta);
  }

  /** Lists every agency a client belongs to — powers the agency switcher in the client portal. */
  async listClientAgencies(userId: string) {
    const links = await this.clientAgencyLinkModel
      .find({ clientId: userId })
      .populate('agencyId', 'name slug')
      .lean();
    return links.map((link) => link.agencyId);
  }

  /**
   * Re-issues a token pair scoped to a different agency the client belongs
   * to. Verifies the ClientAgencyLink exists first — a client can only
   * switch into an agency they've actually joined, not an arbitrary ID.
   */
  async switchAgency(userId: string, targetAgencyId: string, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'client') {
      throw new ForbiddenException('Only client accounts can switch between agencies');
    }

    const link = await this.clientAgencyLinkModel.findOne({ clientId: userId, agencyId: targetAgencyId });
    if (!link) {
      throw new NotFoundException('You are not a member of that agency');
    }

    user.agencyId = new Types.ObjectId(targetAgencyId);
    await user.save();
    return this.issueTokenPair(user, meta);
  }

  /**
   * Called after Google verifies the person. Two paths:
   * - email already exists (signed up with a password before, or logged in
   *   with Google before) → log them in as-is, don't touch their agency.
   * - brand new email → same shape as `register`, but there's no
   *   agencyName to ask for via an OAuth redirect, so we default one and
   *   they can rename it later from settings.
   */
  async findOrCreateFromGoogle(profile: { email: string; name: string; googleId: string }): Promise<TokenPair> {
    let user = await this.userModel.findOne({ email: profile.email });

    if (user) {
      if (!user.googleId) {
        // Same email, first time via Google — link the accounts rather
        // than creating a duplicate user record.
        user.googleId = profile.googleId;
      }
      user.lastLoginAt = new Date();
      await user.save();
      return this.issueTokenPair(user);
    }

    user = await this.userModel.create({
      email: profile.email,
      name: profile.name,
      role: 'agency_owner',
      agencyId: null,
      authProvider: 'google',
      googleId: profile.googleId,
    });

    const agency = await this.agencyModel.create({
      name: `${profile.name}'s Agency`,
      slug: await this.uniqueSlug(this.slugify(`${profile.name}-agency`)),
      ownerId: user._id,
      status: 'trial',
    });

    user.agencyId = agency._id as Types.ObjectId;
    await user.save();

    return this.issueTokenPair(user);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base || 'agency';
    let i = 1;
    // Small collision loop — fine at this scale; revisit if agency creation volume gets high.
    while (await this.agencyModel.exists({ slug })) {
      i += 1;
      slug = `${base}-${i}`;
    }
    return slug;
  }
}