import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

function createLimiter({ windowMs, max, message }) {
  if (isTest) {
    // In test environment, allow high throughput without blocking test runs
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      statusCode: 429,
      message,
      errors: [{ field: 'rate_limit', message }],
    },
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
}

/**
 * Rate limit for authentication attempts (Registration & Login)
 * 15 attempts per 15 minutes per IP to prevent brute force
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
});

/**
 * Rate limit for token refresh calls
 * 45 requests per 15 minutes
 */
export const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 45,
  message: 'Too many token refresh requests. Please wait before trying again.',
});

/**
 * Rate limit for meeting creation
 * 30 meetings per hour per IP to prevent meeting room spam
 */
export const meetingCreationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Meeting creation limit reached for this hour. Please try again later.',
});

/**
 * Rate limit for meeting join attempts
 * 60 join requests per 15 minutes
 */
export const meetingJoinLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many meeting join attempts. Please slow down and try again.',
});

/**
 * Rate limit for recording start and stop operations
 * 20 operations per 15 minutes per IP
 */
export const recordingLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Recording operation rate limit exceeded. Please wait a few moments before trying again.',
});

/**
 * General API global limiter
 * 500 requests per 15 minutes per IP
 */
export const generalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests to MeetSpace API from this IP. Please slow down.',
});
