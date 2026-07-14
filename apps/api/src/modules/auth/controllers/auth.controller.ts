import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { JwtAccessGuard } from '../guards/jwt-access.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthUser } from '../../../common/types/auth-user.type';
import { AUTH_ERRORS, COOKIE_NAME, COOKIE_PATH } from '../auth.constants';
import { validateEnvironment } from '../../../config/env.validation';
import { getAuthConfig } from '../../../config/auth.config';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenPayload } from '../types/auth-token-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  /** POST /auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';

    const result = await this.authService.login(dto, ipAddress, userAgent);

    this.setRefreshCookie(res, result.refreshToken, req);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  /** POST /auth/refresh — refresh token đọc từ HttpOnly cookie */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateOrigin(req);

    const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_INVALID,
        message: 'Không tìm thấy refresh token.',
      });
    }

    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';

    const result = await this.authService.refresh(rawToken, ipAddress, userAgent);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  /** POST /auth/logout */
  @Post('logout')
  @UseGuards(JwtAccessGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() currentUser: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateOrigin(req);

    const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? '';

    // Lấy jti từ refresh token cookie nếu có
    if (rawToken) {
      try {
        const authConfig = getAuthConfig();
        const payload = this.jwtService.verify<RefreshTokenPayload>(rawToken, {
          secret: authConfig.refreshSecret,
        });
        if (payload.jti) {
          await this.authService.logout(
            payload.jti,
            currentUser.id,
            ipAddress,
            userAgent,
          );
        }
      } catch {
        // Token hết hạn hoặc invalid — vẫn clear cookie
      }
    } else {
      // Không có cookie — vẫn ghi audit
      await this.authService.logout('', currentUser.id, ipAddress, userAgent);
    }

    this.clearRefreshCookie(res, req);

    return { message: 'Đăng xuất thành công.' };
  }

  /** GET /auth/me */
  @Get('me')
  @UseGuards(JwtAccessGuard)
  async getMe(@CurrentUser() currentUser: AuthUser) {
    return this.authService.getCurrentUser(currentUser.id);
  }

  // ─────────────────────── Cookie helpers ───────────────────────

  private setRefreshCookie(res: Response, token: string, _req: Request): void {
    const env = validateEnvironment();
    const authConfig = getAuthConfig();
    const maxAgeSec = this.parseExpiresInToSeconds(authConfig.refreshExpiresIn);
    const isProduction = env.nodeEnv === 'production';

    res.cookie(COOKIE_NAME, token, this.refreshCookieOptions(isProduction, maxAgeSec * 1000));
  }

  private clearRefreshCookie(res: Response, _req: Request): void {
    const env = validateEnvironment();
    const isProduction = env.nodeEnv === 'production';

    res.clearCookie(COOKIE_NAME, this.refreshCookieOptions(isProduction));
  }

  private refreshCookieOptions(isProduction: boolean, maxAge?: number) {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: COOKIE_PATH,
      ...(maxAge === undefined ? {} : { maxAge }),
    } as const;
  }

  /**
   * Kiểm tra Origin/Referer cho các endpoint dùng cookie thay đổi trạng thái.
   * Origin phải khớp tuyệt đối với CORS_ORIGIN. Development/test cho phép
   * request không có Origin/Referer để hỗ trợ CLI và automated tests; production từ chối.
   */
  private validateOrigin(req: Request): void {
    const env = validateEnvironment();
    const candidate = req.headers.origin ?? req.headers.referer;

    if (!candidate) {
      if (env.nodeEnv === 'production') {
        throw new ForbiddenException('Origin hoặc Referer là bắt buộc.');
      }
      return;
    }

    try {
      const allowedOrigin = new URL(env.corsOrigin).origin;
      const requestOrigin = new URL(String(candidate)).origin;
      if (requestOrigin !== allowedOrigin) {
        throw new Error('origin mismatch');
      }
    } catch {
      throw new ForbiddenException('Origin không được phép.');
    }
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return String(forwarded).split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
  }

  private parseExpiresInToSeconds(value: string): number {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const unit = trimmed.slice(-1);
    const amount = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(amount)) return 604800;
    switch (unit) {
      case 's': return amount;
      case 'm': return amount * 60;
      case 'h': return amount * 3600;
      case 'd': return amount * 86400;
      default: return 604800;
    }
  }
}
