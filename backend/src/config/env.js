import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret',
  MOCK_EGRESS: process.env.MOCK_EGRESS === 'true',
  RECORDINGS_DIR: process.env.RECORDINGS_DIR
    ? path.resolve(process.cwd(), process.env.RECORDINGS_DIR)
    : path.resolve(process.cwd(), 'recordings'),
  EGRESS_STORAGE_TYPE: process.env.EGRESS_STORAGE_TYPE || 'local',
  EGRESS_S3_KEY: process.env.EGRESS_S3_KEY || '',
  EGRESS_S3_SECRET: process.env.EGRESS_S3_SECRET || '',
  EGRESS_S3_BUCKET: process.env.EGRESS_S3_BUCKET || '',
  EGRESS_S3_REGION: process.env.EGRESS_S3_REGION || 'us-east-1',
  EGRESS_S3_ENDPOINT: process.env.EGRESS_S3_ENDPOINT || '',
};

const REQUIRED_ENV_KEYS = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const INSECURE_DEV_SECRETS = new Set([
  'devkey',
  'secret',
  'meetspace-dev-access-jwt-secret-phase4-2026',
  'meetspace-dev-refresh-jwt-secret-phase4-2026',
  'test-only-access-secret-key-meetspace-webrtc',
  'test-only-refresh-secret-key-meetspace-webrtc',
]);

export function validateRequiredEnv() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Check baseline required keys
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Please configure them in your .env file.`
    );
  }

  // 2. Strict Production Readiness Validations
  if (isProduction) {
    // Prohibit mock recording services in production
    if (process.env.MOCK_EGRESS === 'true') {
      throw new Error(
        '[Security Error] MOCK_EGRESS=true is strictly prohibited in production mode. Real LiveKit Egress is required.'
      );
    }

    // Prohibit insecure or development JWT secrets
    const accessSecret = process.env.JWT_ACCESS_SECRET?.trim() || '';
    const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim() || '';

    if (accessSecret.length < 32 || INSECURE_DEV_SECRETS.has(accessSecret)) {
      throw new Error(
        '[Security Error] Insecure JWT_ACCESS_SECRET in production. Access secret must be a strong, cryptographically random key of at least 32 characters.'
      );
    }

    if (refreshSecret.length < 32 || INSECURE_DEV_SECRETS.has(refreshSecret)) {
      throw new Error(
        '[Security Error] Insecure JWT_REFRESH_SECRET in production. Refresh secret must be a strong, cryptographically random key of at least 32 characters.'
      );
    }

    if (accessSecret === refreshSecret) {
      throw new Error(
        '[Security Error] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical in production.'
      );
    }

    // Prohibit default LiveKit development credentials
    const lkKey = process.env.LIVEKIT_API_KEY?.trim() || '';
    const lkSecret = process.env.LIVEKIT_API_SECRET?.trim() || '';
    const lkUrl = process.env.LIVEKIT_URL?.trim() || '';

    if (!lkKey || lkKey === 'devkey') {
      throw new Error(
        '[Security Error] Production requires a real LIVEKIT_API_KEY. Default "devkey" is rejected.'
      );
    }

    if (!lkSecret || lkSecret === 'secret' || lkSecret.length < 16) {
      throw new Error(
        '[Security Error] Production requires a secure LIVEKIT_API_SECRET. Default "secret" is rejected.'
      );
    }

    if (lkUrl.startsWith('ws://') || lkUrl.includes('127.0.0.1') || lkUrl.includes('localhost')) {
      throw new Error(
        `[Security Error] Insecure LiveKit URL "${lkUrl}" in production. Production must use a secure wss:// URL.`
      );
    }

    // Validate S3 storage configuration if S3 storage is specified
    if (process.env.EGRESS_STORAGE_TYPE === 's3') {
      const s3Missing = ['EGRESS_S3_KEY', 'EGRESS_S3_SECRET', 'EGRESS_S3_BUCKET'].filter(
        (key) => !process.env[key]?.trim()
      );
      if (s3Missing.length > 0) {
        throw new Error(
          `[Security Error] Missing S3 storage credentials for EGRESS_STORAGE_TYPE=s3: ${s3Missing.join(', ')}.`
        );
      }
    }
  }
}

export default env;
