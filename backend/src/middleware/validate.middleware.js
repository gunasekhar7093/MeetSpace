import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

export function validateRequest(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const formattedErrors = result.array({ onlyFirstError: true }).map((err) => ({
    field: err.path || err.param || 'unknown',
    location: err.location,
    message: err.msg,
  }));

  return next(new ApiError(400, 'Validation failed.', formattedErrors));
}

