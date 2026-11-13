import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, {
  tokenStore,
  userCache,
  UNAUTHORIZED_EVENT,
} from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUserState] = useState(() => userCache.read());
  const [booting, setBooting] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return undefined;
    }
    let cancelled = false;
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!cancelled) {
          setUserState(data);
          userCache.write(data);
        }
      })
      .catch(() => {
        /* 401 is handled by the global interceptor */
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const logout = useCallback(() => {
    tokenStore.clear();
    userCache.write(null);
    setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [logout]);

  const persistSession = useCallback((data) => {
    tokenStore.set(data.token);
    userCache.write(data.user);
    setToken(data.token);
    setUserState(data.user);
    return data.user;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      return persistSession(data);
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      return persistSession(data);
    },
    [persistSession],
  );

  const updateUser = useCallback((partial) => {    setUserState((previous) => {
      if (!previous) return previous;
      const next = { ...previous, ...partial };
      userCache.write(next);
      return next;
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUserState(data);
    userCache.write(data);
    return data;
  }, []);

  /**
   * Rotating the password revokes every other session, so the backend returns a
   * replacement token for this browser. Swapping it in keeps the user signed in.
   */
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const { data } = await api.patch('/auth/password', { currentPassword, newPassword });
      persistSession(data);
      return data.user;
    },
    [persistSession],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      booting,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      updateUser,
      refreshProfile,
      changePassword,
    }),
    [token, user, booting, login, register, logout, updateUser, refreshProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
