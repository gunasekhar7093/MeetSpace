import apiClient, {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from './apiClient';

export function normalizeUser(backendUser) {
  if (!backendUser) return null;
  return {
    id: backendUser._id || backendUser.id,
    _id: backendUser._id || backendUser.id,
    name: backendUser.name,
    fullName: backendUser.name,
    email: backendUser.email,
    avatar: backendUser.avatar || null,
    avatarColor: '#1a73e8',
    role: backendUser.role || 'user',
    isEmailVerified: Boolean(backendUser.isEmailVerified),
    createdAt: backendUser.createdAt,
    updatedAt: backendUser.updatedAt,
  };
}

export const authService = {
  apiClient,

  async register({ fullName, email, password }) {
    const response = await apiClient.post('/auth/register', {
      name: fullName,
      email,
      password,
    });
    return {
      user: normalizeUser(response.data?.user),
      message: response.message,
    };
  },

  async login({ email, password }) {
    const response = await apiClient.post('/auth/login', {
      email,
      password,
    });
    const { accessToken, user } = response.data || {};
    setAccessToken(accessToken);
    return {
      accessToken,
      user: normalizeUser(user),
      message: response.message,
    };
  },

  async refresh() {
    const data = await refreshAccessToken();
    return {
      accessToken: data?.accessToken,
      user: normalizeUser(data?.user),
    };
  },

  async restoreSession() {
    if (!getAccessToken()) {
      const data = await refreshAccessToken();
      if (!data?.accessToken) {
        return null;
      }
    }
    const me = await this.getMe();
    return me.user;
  },

  async getMe() {
    const response = await apiClient.get('/auth/me');
    return {
      user: normalizeUser(response.data?.user),
    };
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      clearAccessToken();
    }
  },

  // Password reset backend endpoints are not implemented yet in Phase 1/2
  async requestPasswordReset({ email }) {
    return {
      success: true,
      message: `Password reset is not connected to an email server yet (${email}).`,
    };
  },

  async resetPassword({ token }) {
    return {
      success: true,
      tokenUsed: token || 'placeholder',
      message: 'Password reset backend endpoint is not implemented yet.',
    };
  },
};
