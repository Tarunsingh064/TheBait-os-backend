import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { InviteCode, InviteCodeDocument, InviteCodeKind } from '../schemas/invite-code.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';

@Injectable()
export class InviteCodesService {
  constructor(@InjectModel(InviteCode.name) private codeModel: Model<InviteCodeDocument>) {}

  private generateCode(): string {
    // e.g. "K7F3-QX9B" — short enough to read over a call, long enough
    // (32^8 combinations) that guessing one isn't realistic.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids visual ambiguity
    const bytes = crypto.randomBytes(8);
    let raw = '';
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  }

  /** Fetches both codes for the caller's agency, creating either that doesn't exist yet. */
  async getOrCreateCodes(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    const kinds: InviteCodeKind[] = ['agency_member', 'client'];

    const codes = await Promise.all(
      kinds.map(async (kind) => {
        let existing = await this.codeModel.findOne({ agencyId, kind });
        if (!existing) {
          existing = await this.codeModel.create({
            agencyId,
            kind,
            code: this.generateCode(),
            createdBy: new Types.ObjectId(user.userId),
          });
        }
        return existing;
      }),
    );

    return {
      agencyMemberCode: codes.find((c) => c.kind === 'agency_member')?.code,
      clientCode: codes.find((c) => c.kind === 'client')?.code,
    };
  }

  /**
   * Owner-only. "Revoking" a code = replacing its string, which instantly
   * invalidates the old one for anyone who has it, without needing a
   * separate active/inactive flag to track and check everywhere else.
   */
  async regenerate(user: AuthenticatedUser, kind: InviteCodeKind) {
    const { agencyId } = scopeToTenant(user);
    const newCode = this.generateCode();

    const updated = await this.codeModel.findOneAndUpdate(
      { agencyId, kind },
      { code: newCode, createdBy: new Types.ObjectId(user.userId) },
      { upsert: true, new: true },
    );
    return { kind, code: updated.code };
  }

  /** Public lookup used by the join-with-code flow — no tenant scoping, the code itself IS the tenant lookup. */
  async findByCode(code: string) {
    return this.codeModel.findOne({ code: code.trim().toUpperCase() }).lean();
  }
}
