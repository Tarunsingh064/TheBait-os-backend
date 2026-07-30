import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.refresh_token ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: extractFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  // Attach the raw token string too — AuthService needs to hash and look it
  // up against the stored RefreshToken record to detect reuse/rotation.
  async validate(req: Request, payload: { sub: string; email: string; role: string; agencyId: string | null }) {
    const rawToken = req.cookies?.refresh_token;
    return { ...payload, userId: payload.sub, rawToken };
  }
}
