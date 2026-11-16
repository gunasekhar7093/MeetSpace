import User from '../models/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyTokenHash,
} from '../utils/token.utils.js';

function normalizeEmailAddress(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeUser(userDoc) {
  return userDoc.toJSON();
}

/**
 * Registers a new user account.
 */
export async function registerUser({ name, email, password }) {
  const normalizedEmail = normalizeEmailAddress(email);

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists.', [
      { field: 'email', message: 'Email is already registered.' },
    ]);
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
  });

  return {
    user: sanitizeUser(user),
  };
}

/**
 * Authenticates a user, rotates/stores refresh token hash, and returns tokens + user.
 */
export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmailAddress(email);

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+password +refreshTokenHash'
  );

  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Validates and rotates a refresh token, issuing a fresh access + refresh token pair.
 */
export async function refreshUserSession(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new ApiError(401, 'Refresh token is missing.');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Refresh token has expired. Please log in again.');
    }
    throw new ApiError(401, 'Invalid refresh token.');
  }

  if (decoded.type !== 'refresh' || !decoded.sub) {
    throw new ApiError(401, 'Invalid refresh token payload.');
  }

  const user = await User.findById(decoded.sub).select('+refreshTokenHash');
  if (!user || !user.refreshTokenHash) {
    throw new ApiError(401, 'Session is invalid or has been logged out.');
  }

  const matchesStoredHash = verifyTokenHash(rawRefreshToken, user.refreshTokenHash);
  if (!matchesStoredHash) {
    // Possible token reuse detected: revoke active refresh session
    user.refreshTokenHash = null;
    await user.save();
    throw new ApiError(401, 'Refresh token is no longer valid. Please log in again.');
  }

  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(newRefreshToken);
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Invalidates stored refresh token for the session if present.
 */
export async function logoutUser(rawRefreshToken) {
  if (!rawRefreshToken) {
    return;
  }

  try {
    const decoded = verifyRefreshToken(rawRefreshToken);
    if (decoded?.sub) {
      const user = await User.findById(decoded.sub).select('+refreshTokenHash');
      if (user && user.refreshTokenHash && verifyTokenHash(rawRefreshToken, user.refreshTokenHash)) {
        user.refreshTokenHash = null;
        await user.save();
      }
    }
  } catch {
    // Ignore invalid/expired refresh token on logout and still clear client cookie
  }
}

/**
 * Returns the authenticated user's profile.
 */
export async function getAuthenticatedUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found.');
  }
  return {
    user: sanitizeUser(user),
  };
}

