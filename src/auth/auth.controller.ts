import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, TokenPair } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JoinWithCodeDto } from './dto/Join-with-code.dto';
import { SwitchAgencyDto } from './dto/Switch-agency.dto';
import { Public } from './decorators/public.decorator';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';

const isProd = process.env.NODE_ENV === 'production';

// Centralized cookie options — same flags on every set/clear so nothing drifts.
const accessCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 15 * 24 * 60 * 60 * 1000, // 15 day, mirrors access token TTL
};

const refreshCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/api/auth', // must match the real request path, including the global 'api' prefix set in main.ts
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setAuthCookies(res: Response, tokens: TokenPair) {
    res.cookie('access_token', tokens.accessToken, accessCookieOpts);
    res.cookie('refresh_token', tokens.refreshToken, refreshCookieOpts);
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, tokens);
    return { message: 'Account created' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, tokens);
    return { message: 'Logged in' };
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request & { user: AuthenticatedUser & { rawToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(req.user.userId, req.user.rawToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, tokens);
    return { message: 'Token refreshed' };
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {
    // Passport intercepts this request and redirects to Google — this body never runs.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request & { user: { email: string; name: string; googleId: string } },
    @Res() res: Response,
  ) {
    const tokens = await this.authService.findOrCreateFromGoogle(req.user);
    this.setAuthCookies(res, tokens);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }

  @Public()
  @Post('join')
  async join(
    @Body() dto: JoinWithCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.joinWithCode(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, tokens);
    return { message: 'Joined successfully' };
  }

  // Clients only — lists every agency they belong to, for the portal's agency switcher.
  @Get('my-agencies')
  async myAgencies(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listClientAgencies(user.userId);
  }

  @Post('switch-agency')
  @HttpCode(200)
  async switchAgency(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchAgencyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.switchAgency(user.userId, dto.agencyId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setAuthCookies(res, tokens);
    return { message: 'Switched agency' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password updated. You can now log in.' };
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.userId, dto);
    return { message: 'Password changed successfully' };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.refresh_token;
    if (rawToken) await this.authService.logout(rawToken);
    res.clearCookie('access_token', { ...accessCookieOpts, maxAge: undefined });
    res.clearCookie('refresh_token', { ...refreshCookieOpts, maxAge: undefined });
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.userId);
    res.clearCookie('access_token', { ...accessCookieOpts, maxAge: undefined });
    res.clearCookie('refresh_token', { ...refreshCookieOpts, maxAge: undefined });
    return { message: 'Logged out of all sessions' };
  }
}