import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

let accessToken = null;
let refreshPromise = null;
let authFailureHandler = null;

export class ApiClientError extends Error {
  constructor(message, { status = 500, errors = null, data = null } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export function setOnAuthFailure(handler) {
  authFailureHandler = handler;
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          timeout: 15000,
        }
      )
      .then((res) => {
        const nextToken = res.data?.data?.accessToken;
        if (!nextToken) {
          throw new Error('Refresh response did not return an access token.');
        }
        setAccessToken(nextToken);
        return res.data?.data;
      })
      .catch((refreshErr) => {
        clearAccessToken();
        throw toApiClientError(refreshErr);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function isAuthBypassEndpoint(url = '') {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

function toApiClientError(error) {
  if (error instanceof ApiClientError) {
    return error;
  }
  const status = error.response?.status || 0;
  const payload = error.response?.data || null;
  const message =
    payload?.message ||
    error.message ||
    'Unable to reach the MeetSpace server. Please check your connection.';

  return new ApiClientError(message, {
    status,
    errors: payload?.errors || null,
    data: payload,
  });
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (accessToken && !config.headers?.Authorization) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(toApiClientError(error))
);

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthBypassEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        const refreshData = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshData.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (typeof authFailureHandler === 'function') {
          authFailureHandler(toApiClientError(refreshError));
        }
        return Promise.reject(toApiClientError(refreshError));
      }
    }

    return Promise.reject(toApiClientError(error));
  }
);

export default apiClient;
