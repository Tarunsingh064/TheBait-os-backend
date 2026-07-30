import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

/**
 * Deliberately re-reads `hasBillingAccess` from the database on every
 * request rather than trusting the JWT payload — billing access can be
 * revoked by the owner at any moment, and that revocation needs to take
 * effect immediately, not just after the team head's token happens to expire.
 */
@Injectable()
export class BillingAccessGuard implements CanActivate {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();

    if (user?.role === 'agency_owner') return true;

    if (user?.role === 'agency_team_head') {
      const dbUser = await this.userModel.findById(user.userId).lean();
      if (dbUser?.hasBillingAccess) return true;
      throw new ForbiddenException(
        'You do not have billing access. Ask your agency owner to grant it from the Members page.',
      );
    }

    throw new ForbiddenException('Only the agency owner or a team head with billing access can do this');
  }
}
