import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { User, UserSchema } from '../schemas/user.schema';
import { Agency, AgencySchema } from '../schemas/agency.schema';
import { RefreshToken, RefreshTokenSchema } from '../schemas/refresh-token.schema';
import { PasswordResetToken, PasswordResetTokenSchema } from '../schemas/password-reset-token.schema';
import { ClientAgencyLink, ClientAgencyLinkSchema } from '../schemas/client-agency-link.schema'; // <-- add this
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { InviteCodesModule } from '../invite-codes/invite-codes.module'; // adjust path

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secrets/expiry set per-sign-call in AuthService
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Agency.name, schema: AgencySchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
      { name: ClientAgencyLink.name, schema: ClientAgencyLinkSchema }, // <-- add this
    ]),
    InviteCodesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, GoogleStrategy, GoogleAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}