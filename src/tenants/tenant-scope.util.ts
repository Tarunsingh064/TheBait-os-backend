import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * Every service method that reads/writes tenant data MUST run its query
 * through this — never hand-roll `{ agencyId: someId }` inline. One central
 * place means one place to audit, and it's what stands between "each agency
 * only sees its own data" and a cross-tenant leak.
 *
 * superadmin passing an explicit agencyId (e.g. from an admin-portal route
 * param) is allowed to cross tenants by design; everyone else is pinned to
 * their own token's agencyId regardless of what they pass in.
 */
export function scopeToTenant(
  user: AuthenticatedUser,
  requestedAgencyId?: string,
): { agencyId: Types.ObjectId } {
  if (user.role === 'superadmin') {
    if (!requestedAgencyId) {
      throw new ForbiddenException('agencyId is required for superadmin cross-tenant queries');
    }
    return { agencyId: new Types.ObjectId(requestedAgencyId) };
  }

  if (!user.agencyId) {
    throw new ForbiddenException('No agency context associated with this account');
  }

  return { agencyId: new Types.ObjectId(user.agencyId) };
}
