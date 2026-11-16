import { useCallback, useEffect, useState } from 'react';
import { MOCK_USER_SETTINGS } from '../data/mockUser';
import { authService } from '../services/authService';
import { clearAccessToken, setOnAuthFailure } from '../services/apiClient';
import { socketService } from '../services/socketService';
import { userService } from '../services/userService';
import { AuthContext } from './contexts';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('meetspace_settings');
    return saved ? JSON.parse(saved) : MOCK_USER_SETTINGS;
  });

  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
    });
    return () => setOnAuthFailure(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function initAuth() {
      // Remove legacy mock auth storage keys if present from earlier frontend phase
      localStorage.removeItem('meetspace_auth_token');
      localStorage.removeItem('meetspace_user');
      localStorage.removeItem('meetspace_signed_out');

      try {
        const restoredUser = await authService.restoreSession();
        if (active) {
          setUser(restoredUser);
        }
      } catch {
        clearAccessToken();
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setIsAuthLoading(false);
        }
      }
    }

    initAuth();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await authService.login(credentials);
    // Hydrate profile from /auth/me to keep session user canonical
    const me = await authService.getMe();
    setUser(me.user || response.user);
    return {
      ...response,
      user: me.user || response.user,
    };
  }, []);

  const register = useCallback(async (payload) => {
    await authService.register(payload);
    // Authenticate immediately after registration so HttpOnly cookie & session start cleanly
    const loginRes = await authService.login({
      email: payload.email,
      password: payload.password,
    });
    const me = await authService.getMe();
    setUser(me.user || loginRes.user);
    return {
      ...loginRes,
      user: me.user || loginRes.user,
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      socketService.disconnect();
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const me = await authService.getMe();
    setUser(me.user);
    return me.user;
  }, []);

  // Device & local UI settings remain local until user settings APIs are added
  const updateSettings = useCallback(
    async (section, sectionUpdates) => {
      const nextSettings = {
        ...settings,
        [section]: {
          ...settings[section],
          ...sectionUpdates,
        },
      };
      await userService.updateSettings(nextSettings);
      localStorage.setItem('meetspace_settings', JSON.stringify(nextSettings));
      setSettings(nextSettings);
      return nextSettings;
    },
    [settings]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isAuthLoading,
        settings,
        login,
        register,
        logout,
        refreshProfile,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
