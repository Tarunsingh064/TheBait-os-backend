import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Used only on POST /auth/refresh — separate from the access-token guard
// so a valid refresh token can never be used to call ordinary API routes.
@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {}
