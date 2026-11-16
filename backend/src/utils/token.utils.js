import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const REFRESH_COOKIE_NAME = 'refreshToken';

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured.');
  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured.');
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      type: 'access',
    },
    getAccessSecret(),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      type: 'refresh',
      jti: crypto.randomUUID(),
    },
    getRefreshSecret(),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getAccessSecret());
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret());
}

/**
 * Creates a deterministic SHA-256 hex digest of a refresh token for database storage.
 * SHA-256 avoids bcrypt's 72-byte input truncation on JWT strings.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyTokenHash(rawToken, storedHash) {
  if (!rawToken || !storedHash) return false;
  const candidateHash = hashToken(rawToken);
  const a = Buffer.from(candidateHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseDurationToMs(durationStr = '7d') {
  const match = String(durationStr).trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

export function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: parseDurationToMs(process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
  };
}

export function getClearRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  };
}

