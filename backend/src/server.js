import http from 'node:http';
import env, { validateRequiredEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { closeSocket, initSocket } from './socket/socket.js';
import logger from './utils/logger.js';

let httpServer = null;
let isShuttingDown = false;

async function startServer() {
  try {
    validateRequiredEnv();
    await connectDB(env.MONGODB_URI);

    const app = createApp();
    httpServer = http.createServer(app);
    initSocket(httpServer);

    httpServer.listen(env.PORT, () => {
      logger.info(
        `[MeetSpace Backend] Running in ${env.NODE_ENV} mode on port ${env.PORT} (with Socket.IO & LiveKit)`,
        {
          port: env.PORT,
          nodeEnv: env.NODE_ENV,
          pid: process.pid,
        }
      );
    });
  } catch (error) {
    logger.error(`[MeetSpace Backend] Startup failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`[MeetSpace Backend] Received ${signal}. Commencing graceful shutdown...`, {
    signal,
    pid: process.pid,
  });

  // Force exit safety timeout (10 seconds) to prevent hung process
  const forceExitTimer = setTimeout(() => {
    logger.error('[MeetSpace Backend] Graceful shutdown timed out. Forcing process termination.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    // 1. Stop accepting new HTTP connections
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close((err) => {
          if (err) {
            logger.error(`[MeetSpace Backend] HTTP server close error: ${err.message}`);
          } else {
            logger.info('[MeetSpace Backend] HTTP server closed cleanly.');
          }
          resolve();
        });
      });
    }

    // 2. Disconnect Socket.IO cleanly
    try {
      closeSocket();
      logger.info('[MeetSpace Backend] Socket.IO server closed cleanly.');
    } catch (socketErr) {
      logger.error(`[MeetSpace Backend] Error closing Socket.IO: ${socketErr.message}`);
    }

    // 3. Close database connection
    await disconnectDB();

    logger.info('[MeetSpace Backend] Graceful shutdown completed successfully.');
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  } catch (err) {
    logger.error(`[MeetSpace Backend] Error during graceful shutdown: ${err.message}`, {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

// Process signal listeners
process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));

// Uncaught exception and unhandled rejection guards
process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`, {
    error: err.message,
    stack: err.stack,
  });
  shutdown('UNCAUGHT_EXCEPTION', 1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(`[FATAL] Unhandled Promise Rejection: ${message}`, {
    error: message,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  shutdown('UNHANDLED_REJECTION', 1);
});

startServer();
