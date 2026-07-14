export interface AccessTokenPayload {
  /** Subject: user ID */
  sub: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  /** Subject: user ID */
  sub: string;
  type: 'refresh';
  /** JWT ID — unique per token, stored hashed in DB */
  jti: string;
}
