import crypto from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'refreshtoken',
  'accesstoken',
  'token',
  'authorization',
  'cookie',
  'secret',
  'jwt_access_secret',
  'jwt_refresh_secret',
  'livekit_api_secret',
  'egress_s3_secret',
]);

export function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  const masked = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      masked[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

class Logger {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  formatLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = maskSensitiveData(meta);

    if (this.isProduction) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...sanitizedMeta,
      });
    }

    const metaStr = Object.keys(sanitizedMeta).length > 0 ? ` ${JSON.stringify(sanitizedMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  info(message, meta = {}) {
    console.log(this.formatLog('info', message, meta));
  }

  warn(message, meta = {}) {
    console.warn(this.formatLog('warn', message, meta));
  }

  error(message, meta = {}) {
    console.error(this.formatLog('error', message, meta));
  }

  debug(message, meta = {}) {
    if (!this.isProduction || process.env.DEBUG === 'true') {
      console.log(this.formatLog('debug', message, meta));
    }
  }
}

export const logger = new Logger();
export default logger;
