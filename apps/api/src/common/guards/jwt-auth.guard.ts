/**
 * Re-export JwtAccessGuard từ AuthModule để các module khác có thể import
 * mà không phải phụ thuộc trực tiếp vào auth module internals.
 */
export { JwtAccessGuard as JwtAuthGuard } from '../../modules/auth/guards/jwt-access.guard';
