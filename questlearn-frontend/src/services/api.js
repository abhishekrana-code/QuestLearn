import axios from 'axios';

const TOKEN_KEY = 'questlearn.token';
const USER_KEY = 'questlearn.user';

export const UNAUTHORIZED_EVENT = 'questlearn:unauthorized';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export const userCache = {
  read() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  },
};

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

const OFFLINE_MESSAGE =
  'Cannot reach the QuestLearn server. Make sure the backend is running, then try again.';

/** Extracts a human-readable message from an axios error. */
export function apiError(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.code === 'ERR_CANCELED') {
    return fallback;
  }

  // No response at all: the server is down, still starting, or the network dropped.
  if (!error?.response) {
    return OFFLINE_MESSAGE;
  }

  const data = error.response.data;
  if (data?.fieldErrors) {
    const first = Object.values(data.fieldErrors)[0];
    if (first) return first;
  }
  if (data?.message) return data.message;

  // A proxy in front of a dead backend answers with plain text, not our JSON.
  if (typeof data === 'string' && error.response.status >= 500) {
    return OFFLINE_MESSAGE;
  }

  return fallback;
}

export default api;
