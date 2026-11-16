import crypto from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const existingId = req.headers['x-request-id'];
  const requestId =
    typeof existingId === 'string' && existingId.trim()
      ? existingId.trim().slice(0, 64)
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export default requestIdMiddleware;
