import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import apiRoutes from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { requestLogger } from './middleware/requestLogger.middleware.js';
import { generalApiLimiter } from './middleware/rateLimit.middleware.js';

export function createApp() {
  const app = express();

  // 1. Assign unique Correlation / Request ID to every incoming request
  app.use(requestIdMiddleware);

  // 2. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'http:',
            'https:',
            'stun:stun.l.google.com:19302',
          ],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Required for video stream range requests
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // 3. Explicit CORS Origin Validation
  const rawOrigins = process.env.FRONTEND_URL || 'http://localhost:5173';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server webhooks)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`CORS origin "${origin}" not allowed by policy.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'Range',
      ],
      exposedHeaders: [
        'X-Request-Id',
        'Content-Range',
        'Accept-Ranges',
        'Content-Length',
      ],
      maxAge: 86400, // 24 hours preflight cache
    })
  );

  // 4. Request Logging (with masked sensitive fields)
  app.use(requestLogger);

  // 5. Global API Rate Limiting
  app.use('/api', generalApiLimiter);

  // 6. Request Body Parsing with Strict Size Limits
  app.use(
    express.json({
      limit: '32kb',
      verify: (req, _res, buf) => {
        // Capture unaltered raw body for LiveKit HMAC webhook signature verification
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '32kb' }));
  app.use(cookieParser());

  // 7. Mount API Routes
  app.use('/api', apiRoutes);

  // 8. 404 & Centralized Error Handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
