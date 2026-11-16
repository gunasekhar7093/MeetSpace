import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import {
  REFRESH_COOKIE_NAME,
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
} from '../utils/token.utils.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const result = await authService.registerUser({ name, email, password });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'User registered successfully.',
    data: result,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.loginUser({
    email,
    password,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Logged in successfully.',
    data: {
      user,
      accessToken,
    },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  try {
    const { user, accessToken, refreshToken } =
      await authService.refreshUserSession(rawRefreshToken);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Access token refreshed successfully.',
      data: {
        user,
        accessToken,
      },
    });
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
    throw error;
  }
});

export const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logoutUser(rawRefreshToken);

  res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Logged out successfully.',
    data: null,
  });
});

export const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getAuthenticatedUser(req.userId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Authenticated user retrieved successfully.',
    data: result,
  });
});

