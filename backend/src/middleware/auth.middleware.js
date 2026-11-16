import User from '../models/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/token.utils.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authentication required. Missing Bearer token.');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new ApiError(401, 'Authentication required. Token is empty.');
  }

  const decoded = verifyAccessToken(token);
  if (decoded.type !== 'access' || !decoded.sub) {
    throw new ApiError(401, 'Invalid access token.');
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new ApiError(401, 'Authenticated user no longer exists.');
  }

  req.user = user;
  req.userId = String(user._id);
  next();
});

