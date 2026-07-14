import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { validateEnvironment } from '../../../config/env.validation';
import { getAuthConfig } from '../../../config/auth.config';
import { AuthRepository } from '../repositories/auth.repository';
import { LoginDto } from '../dto/login.dto';
import { AccessTokenPayload, RefreshTokenPayload } from '../types/auth-token-payload.type';
import { AUTH_ERRORS, RATE_LIMIT_DEFAULTS } from '../auth.constants';

/** Thông báo lỗi chung — không phân biệt email sai hay password sai */
const INVALID_CREDENTIALS_MSG = 'Email hoặc mật khẩu không chính xác.';

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string;
    status: string;
  };
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Rate limit store — in-memory Map.
   * Key: `${ip}:${email.toLowerCase()}` để giới hạn theo cả IP và email.
   * Reset khi server restart — phù hợp cho dự án nội bộ.
   */
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();
  private readonly rateLimitCleanupTimer: NodeJS.Timeout;
  private static readonly RATE_LIMIT_MAX_ENTRIES = 10_000;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {
    const intervalMs = Math.max(1_000, Math.min(this.rateLimitConfig().windowMs, 60_000));
    this.rateLimitCleanupTimer = setInterval(() => this.cleanupExpiredRateLimits(), intervalMs);
    this.rateLimitCleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.rateLimitCleanupTimer);
  }

  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // 1. Kiểm tra rate limit
    this.checkRateLimit(ipAddress, dto.email);

    // 2. Tìm user — không tiết lộ lý do thất bại cụ thể
    const user = await this.authRepository.findUserByEmail(dto.email);

    if (!user) {
      await this.recordFailedLogin(undefined, dto.email, ipAddress, userAgent);
      this.incrementFailedAttempt(ipAddress, dto.email);
      throw new UnauthorizedException({
        code: AUTH_ERRORS.INVALID_CREDENTIALS,
        message: INVALID_CREDENTIALS_MSG,
      });
    }

    // 3. Verify password với argon2
    let isPasswordValid = false;
    try {
      isPasswordValid = await argon2.verify(user.password_hash, dto.password);
    } catch {
      // argon2 lỗi nội bộ — log nhưng không lộ chi tiết
      this.logger.error('argon2 verify error for user login attempt');
    }

    if (!isPasswordValid) {
      await this.recordFailedLogin(user.id, dto.email, ipAddress, userAgent);
      this.incrementFailedAttempt(ipAddress, dto.email);
      throw new UnauthorizedException({
        code: AUTH_ERRORS.INVALID_CREDENTIALS,
        message: INVALID_CREDENTIALS_MSG,
      });
    }

    // 4. Kiểm tra trạng thái tài khoản — sau khi verify password để tránh timing attack
    if (user.deleted_at !== null) {
      await this.recordFailedLogin(user.id, dto.email, ipAddress, userAgent);
      throw new UnauthorizedException({
        code: AUTH_ERRORS.INVALID_CREDENTIALS,
        message: INVALID_CREDENTIALS_MSG,
      });
    }

    if (user.status === 'INACTIVE') {
      await this.recordFailedLogin(user.id, dto.email, ipAddress, userAgent);
      throw new UnauthorizedException({
        code: AUTH_ERRORS.ACCOUNT_DISABLED,
        message: INVALID_CREDENTIALS_MSG,
      });
    }

    if (user.status === 'LOCKED') {
      await this.recordFailedLogin(user.id, dto.email, ipAddress, userAgent);
      throw new UnauthorizedException({
        code: AUTH_ERRORS.ACCOUNT_LOCKED,
        message: INVALID_CREDENTIALS_MSG,
      });
    }

    // 5. Xóa rate limit sau khi login thành công
    this.clearRateLimit(ipAddress, dto.email);

    // 6. Tạo tokens
    const { accessToken, refreshToken, jti, expiresIn, refreshExpiresAt } =
      await this.generateTokenPair(user.id, user.email);

    // 7. Lưu hash của refresh token vào DB
    const tokenHash = await argon2.hash(refreshToken);
    await this.authRepository.saveRefreshToken({
      userId: user.id,
      tokenHash,
      jti,
      expiresAt: refreshExpiresAt,
      userAgent,
      ipAddress,
    });

    // 8. Cập nhật last_login_at
    await this.authRepository.updateLastLogin(user.id);

    // 9. Ghi audit
    await this.authRepository.createAuditLog({
      userId: user.id,
      module: 'auth',
      entityType: 'users',
      entityId: user.id,
      action: 'LOGIN_SUCCESS',
      newData: { email: user.email },
      ipAddress,
      userAgent,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        employeeCode: user.employee_code,
        fullName: user.full_name,
        email: user.email,
        status: user.status,
      },
    };
  }

  async refresh(
    rawRefreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const authConfig = getAuthConfig();

    // 1. Verify JWT signature và expiry
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: authConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_INVALID,
        message: 'Token không hợp lệ.',
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_INVALID,
        message: 'Token không hợp lệ.',
      });
    }

    // 2. Tìm record trong DB
    const tokenRecord = await this.authRepository.findRefreshTokenByJti(payload.jti);

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.REFRESH_REVOKED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    // 3. Kiểm tra revoked
    if (tokenRecord.revoked_at !== null) {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.REFRESH_REVOKED,
        message: 'Phiên đăng nhập đã hết hạn.',
      });
    }

    // 4. Kiểm tra expires_at
    if (tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_EXPIRED,
        message: 'Phiên đăng nhập đã hết hạn.',
      });
    }

    // 5. Verify hash của raw token với hash trong DB
    let isHashValid = false;
    try {
      isHashValid = await argon2.verify(tokenRecord.token_hash, rawRefreshToken);
    } catch {
      this.logger.error('argon2 verify error during token refresh');
    }

    if (!isHashValid) {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_INVALID,
        message: 'Token không hợp lệ.',
      });
    }

    // 6. Tạo access token mới
    const { accessToken, expiresIn } = this.generateAccessToken(
      tokenRecord.user_id,
      payload.sub, // sub là email không, cần lấy từ DB
    );

    // Lấy email từ DB để đảm bảo dữ liệu hiện tại
    const user = await this.authRepository.findUserById(tokenRecord.user_id);
    if (!user || user.deleted_at !== null || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.ACCOUNT_DISABLED,
        message: 'Tài khoản không khả dụng.',
      });
    }

    const { accessToken: freshAccessToken, expiresIn: freshExpiresIn } =
      this.generateAccessToken(user.id, user.email);

    // 7. Ghi audit
    await this.authRepository.createAuditLog({
      userId: user.id,
      module: 'auth',
      entityType: 'users',
      entityId: user.id,
      action: 'TOKEN_REFRESH',
      ipAddress,
      userAgent,
    });

    // Suppress unused variable
    void accessToken;
    void expiresIn;

    return { accessToken: freshAccessToken, expiresIn: freshExpiresIn };
  }

  async logout(
    jti: string,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    await this.authRepository.revokeRefreshToken(jti).catch(() => {
      // Token có thể đã bị revoke rồi — không throw error
    });

    await this.authRepository.createAuditLog({
      userId,
      module: 'auth',
      entityType: 'users',
      entityId: userId,
      action: 'LOGOUT',
      ipAddress,
      userAgent,
    });
  }

  async getCurrentUser(userId: string) {
    const user = await this.authRepository.findAuthUserById(userId);
    if (!user || user.deleted_at !== null || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: AUTH_ERRORS.TOKEN_INVALID,
        message: 'Không tìm thấy người dùng.',
      });
    }
    return {
      id: user.id,
      employeeCode: user.employee_code,
      fullName: user.full_name,
      email: user.email,
      status: user.status,
      departmentId: user.department_id,
      roles: user.user_roles_user_roles_user_idTousers.map((assignment) => ({ code: assignment.roles.code, scopeType: assignment.scope_type, scopeId: assignment.scope_id })),
      permissions: [...new Set(user.user_roles_user_roles_user_idTousers.flatMap((assignment) => assignment.roles.role_permissions.map((rolePermission) => rolePermission.permissions.code)))],
    };
  }

  // ─────────────────────── Private helpers ───────────────────────

  private async generateTokenPair(userId: string, email: string) {
    const authConfig = getAuthConfig();
    const env = validateEnvironment();

    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const accessExpiresInSec = this.parseExpiresInToSeconds(authConfig.accessExpiresIn);
    const refreshExpiresInSec = this.parseExpiresInToSeconds(authConfig.refreshExpiresIn);

    const accessPayload: AccessTokenPayload = { sub: userId, email, type: 'access' };
    const accessToken = this.jwtService.sign(accessPayload as unknown as Record<string, unknown>, {
      secret: authConfig.accessSecret,
      expiresIn: accessExpiresInSec,
    });

    const refreshPayload: RefreshTokenPayload = { sub: userId, type: 'refresh', jti };
    const refreshToken = this.jwtService.sign(refreshPayload as unknown as Record<string, unknown>, {
      secret: authConfig.refreshSecret,
      expiresIn: refreshExpiresInSec,
    });

    const refreshExpiresAt = new Date((now + refreshExpiresInSec) * 1000);

    // env used implicitly through authConfig
    void env;

    return { accessToken, refreshToken, jti, expiresIn: accessExpiresInSec, refreshExpiresAt };
  }

  private generateAccessToken(userId: string, email: string) {
    const authConfig = getAuthConfig();
    const accessExpiresInSec = this.parseExpiresInToSeconds(authConfig.accessExpiresIn);
    const accessPayload: AccessTokenPayload = { sub: userId, email, type: 'access' };
    const accessToken = this.jwtService.sign(accessPayload as unknown as Record<string, unknown>, {
      secret: authConfig.accessSecret,
      expiresIn: accessExpiresInSec,
    });
    return { accessToken, expiresIn: accessExpiresInSec };
  }

  /**
   * Chuyển đổi chuỗi "15m", "7d", "3600" thành số giây.
   */
  private parseExpiresInToSeconds(value: string): number {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const unit = trimmed.slice(-1);
    const amount = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(amount)) return 900;
    switch (unit) {
      case 's': return amount;
      case 'm': return amount * 60;
      case 'h': return amount * 3600;
      case 'd': return amount * 86400;
      default: return 900;
    }
  }

  private checkRateLimit(ipAddress: string, email: string): void {
    const { maxAttempts, windowMs } = this.rateLimitConfig();
    const key = this.rateLimitKey(ipAddress, email);
    const entry = this.rateLimitStore.get(key);
    const now = Date.now();

    if (!entry) return;

    // Xóa entry đã hết window
    if (now - entry.firstAttemptAt > windowMs) {
      this.rateLimitStore.delete(key);
      return;
    }

    if (entry.count >= maxAttempts) {
      throw new HttpException(
        {
          code: AUTH_ERRORS.RATE_LIMIT_EXCEEDED,
          message: 'Quá nhiều lần thử. Vui lòng thử lại sau.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private incrementFailedAttempt(ipAddress: string, email: string): void {
    const { windowMs } = this.rateLimitConfig();
    if (this.rateLimitStore.size >= AuthService.RATE_LIMIT_MAX_ENTRIES) {
      this.cleanupExpiredRateLimits();
      if (this.rateLimitStore.size >= AuthService.RATE_LIMIT_MAX_ENTRIES) {
        const oldestKey = this.rateLimitStore.keys().next().value;
        if (oldestKey !== undefined) {
          this.rateLimitStore.delete(oldestKey);
        }
      }
    }
    const key = this.rateLimitKey(ipAddress, email);
    const now = Date.now();
    const entry = this.rateLimitStore.get(key);

    if (!entry || now - entry.firstAttemptAt > windowMs) {
      this.rateLimitStore.set(key, { count: 1, firstAttemptAt: now });
    } else {
      entry.count += 1;
    }
  }

  private clearRateLimit(ipAddress: string, email: string): void {
    this.rateLimitStore.delete(this.rateLimitKey(ipAddress, email));
  }

  /** Removes expired in-memory entries. The limiter intentionally resets on API restart. */
  cleanupExpiredRateLimits(now = Date.now()): void {
    const { windowMs } = this.rateLimitConfig();
    for (const [key, entry] of this.rateLimitStore) {
      if (now - entry.firstAttemptAt > windowMs) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  private rateLimitConfig(): { maxAttempts: number; windowMs: number } {
    return {
      maxAttempts: Number(process.env.RATE_LIMIT_MAX_ATTEMPTS) || RATE_LIMIT_DEFAULTS.MAX_ATTEMPTS,
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_DEFAULTS.WINDOW_MS,
    };
  }

  private rateLimitKey(ipAddress: string, email: string): string {
    return `${ipAddress}:${email.toLowerCase()}`;
  }

  private async recordFailedLogin(
    userId: string | undefined,
    email: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    // Không log password, không log token
    await this.authRepository.createAuditLog({
      userId,
      module: 'auth',
      entityType: 'users',
      action: 'LOGIN_FAILED',
      newData: { email },
      ipAddress,
      userAgent,
    }).catch(() => {
      // Audit log thất bại không nên block response
    });
  }
}
