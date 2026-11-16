import User from '../models/User.model.js';
import { verifyAccessToken } from '../utils/token.utils.js';

/**
 * Socket.IO authentication middleware.
 * Verifies the JWT access token provided in the handshake auth object or authorization header.
 */
export async function socketAuthMiddleware(socket, next) {
  try {
    const rawAuth =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization;

    if (!rawAuth || typeof rawAuth !== 'string') {
      const err = new Error('Authentication required. Missing access token.');
      err.data = { code: 'AUTH_REQUIRED' };
      return next(err);
    }

    const token = rawAuth.startsWith('Bearer ')
      ? rawAuth.slice(7).trim()
      : rawAuth.trim();

    if (!token) {
      const err = new Error('Authentication required. Token is empty.');
      err.data = { code: 'AUTH_REQUIRED' };
      return next(err);
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      const message =
        jwtErr.name === 'TokenExpiredError'
          ? 'Access token has expired.'
          : 'Invalid access token.';
      const err = new Error(message);
      err.data = { code: jwtErr.name || 'INVALID_TOKEN' };
      return next(err);
    }

    if (decoded.type !== 'access' || !decoded.sub) {
      const err = new Error('Invalid token type.');
      err.data = { code: 'INVALID_TOKEN_TYPE' };
      return next(err);
    }

    const user = await User.findById(decoded.sub).select('name email avatar role');
    if (!user) {
      const err = new Error('Authenticated user no longer exists.');
      err.data = { code: 'USER_NOT_FOUND' };
      return next(err);
    }

    socket.user = {
      id: String(user._id),
      _id: String(user._id),
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      role: user.role || 'user',
    };
    socket.userId = String(user._id);

    return next();
  } catch (error) {
    const err = new Error('Authentication failed.');
    err.data = { message: error.message };
    return next(err);
  }
}

