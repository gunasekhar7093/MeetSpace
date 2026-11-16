import logger from '../utils/logger.js';

export function requestLogger(req, res, next) {
  // Avoid logging noisy health checks in normal logs
  if (req.path.startsWith('/api/health')) {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.originalUrl || req.url} ${statusCode} - ${durationMs}ms`, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip || req.socket.remoteAddress,
      userId: req.userId || null,
    });
  });

  next();
}

export default requestLogger;
