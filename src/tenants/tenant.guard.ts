import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

// Runs after JwtAuthGuard. Guarantees req.user.agencyId exists for any
// tenant-scoped route, and blocks the case where a token was somehow issued
// without a tenant (shouldn't happen, but never trust the token alone).
// superadmin is exempt — it operates across all tenants via the admin module.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === 'superadmin') return true;
    if (!user?.agencyId) {
      throw new ForbiddenException('No agency context associated with this account');
    }
    return true;
  }
}
