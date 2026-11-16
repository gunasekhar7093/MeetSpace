import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/ApiResponse.js';
import logger from '../utils/logger.js';

function handleDuplicateKeyError(err) {
  const fields = Object.keys(err.keyValue || {});
  const field = fields[0] || 'field';
  const message =
    field === 'email'
      ? 'An account with this email already exists.'
      : `Duplicate value for ${field}.`;

  return {
    statusCode: 409,
    message,
    errors: [{ field, message }],
  };
}

function handleMongooseValidationError(err) {
  const errors = Object.values(err.errors || {}).map((item) => ({
    field: item.path,
    message: item.message,
  }));

  return {
    statusCode: 400,
    message: 'Validation failed.',
    errors,
  };
}

export function errorHandler(err, req, res, _next) {
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = err instanceof ApiError ? err.statusCode : 500;
  let message = err.message || 'Internal server error.';
  let errors = err instanceof ApiError ? err.errors : null;

  if (err.code === 11000) {
    const formatted = handleDuplicateKeyError(err);
    statusCode = formatted.statusCode;
    message = formatted.message;
    errors = formatted.errors;
  } else if (err.name === 'ValidationError') {
    const formatted = handleMongooseValidationError(err);
    statusCode = formatted.statusCode;
    message = formatted.message;
    errors = formatted.errors;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path || 'identifier'}.`;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired.';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Invalid authentication token.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload too large.';
  } else if (statusCode === 500 && isProduction) {
    message = 'Internal server error.';
    errors = null;
  }

  // Structured logging for server errors and security warnings
  if (statusCode >= 500) {
    logger.error(`Server Error: ${err.message}`, {
      requestId: req.id,
      path: req.originalUrl || req.url,
      method: req.method,
      stack: isProduction ? undefined : err.stack,
    });
  } else if (statusCode === 401 || statusCode === 403) {
    logger.warn(`Security Warning: ${err.message}`, {
      requestId: req.id,
      path: req.originalUrl || req.url,
      method: req.method,
      ip: req.ip,
      userId: req.userId || null,
    });
  }

  return sendError(res, { statusCode, message, errors });
}

export default errorHandler;
