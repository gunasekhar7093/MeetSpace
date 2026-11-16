import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess, sendError } from '../utils/ApiResponse.js';

const router = Router();

/**
 * Basic health endpoint for load balancers & monitoring
 */
router.get('/', (_req, res) => {
  return sendSuccess(res, {
    statusCode: 200,
    message: 'MeetSpace API is healthy.',
    data: {
      service: 'meetspace-backend',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

/**
 * Liveness Probe: Quick check if server process is running
 */
router.get('/live', (_req, res) => {
  return res.status(200).json({
    status: 'live',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness Probe: Checks if server is ready to accept traffic (database connection ready)
 * Returns HTTP 503 if database connection is down
 */
router.get('/ready', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isDbReady = dbState === 1;

  if (!isDbReady) {
    return sendError(res, {
      statusCode: 503,
      message: 'Service is not ready. Database connection is offline.',
      errors: [
        {
          component: 'database',
          status: 'disconnected',
        },
      ],
    });
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Service is ready to handle traffic.',
    data: {
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

export default router;
