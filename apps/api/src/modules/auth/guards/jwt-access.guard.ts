import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard bảo vệ endpoint bằng JWT access token.
 * Dùng PassportStrategy 'jwt-access' đã đăng ký trong AuthModule.
 * Trả 401 nếu token thiếu, hết hạn, hoặc chữ ký sai.
 */
@Injectable()
export class JwtAccessGuard extends AuthGuard('jwt-access') {}
