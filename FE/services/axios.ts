import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import * as SecureStore from "expo-secure-store";
import { DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

// Token storage keys
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// Store for refresh token promise to prevent multiple simultaneous refresh calls
let refresh_tokenPromise: Promise<string | null> | null = null;

// Helper to get timestamp for logs
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
};

// Helper to get token prefix for logging (first 20 chars)
const getTokenPrefix = (token: string) => {
  return token.length > 20 ? `${token.substring(0, 20)}...` : token;
};

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =======================
// REQUEST INTERCEPTOR
// =======================
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      let access_token = null;
      try {
        access_token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      } catch (e) {
        console.log("SecureStore get ACCESS_TOKEN_KEY error, using fallback:", e);
      }
      if (!access_token) {
        access_token = await AsyncStorage.getItem("access_token_fallback");
      }

      if (access_token && config.headers) {
        config.headers.Authorization = `Bearer ${access_token}`;
      }

      // Sync demo mode status via custom header
      const demo_mode = await AsyncStorage.getItem("demo_mode");
      if (config.headers) {
        config.headers["X-Demo-Mode"] = demo_mode === "true" ? "true" : "false";
      }
    } catch (error) {
      console.error("❌ Error setting request headers:", error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// =======================
// RESPONSE INTERCEPTOR
// =======================
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      console.log(`[${getTimestamp()}] ⚠️ [TOKEN REFRESH] 401 Unauthorized detected, attempting token refresh...`);

      try {
        let newToken: string | null = null;
        if (refresh_tokenPromise) {
          console.log(`[${getTimestamp()}] 🔄 [TOKEN REFRESH] Refresh already in progress, waiting...`);
          newToken = await refresh_tokenPromise;
        } else {
          console.log(`[${getTimestamp()}] 🔄 [TOKEN REFRESH] Starting refresh process...`);
          refresh_tokenPromise = refreshAccessToken();
          newToken = await refresh_tokenPromise;
          refresh_tokenPromise = null;
        }

        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          console.log(`[${getTimestamp()}] ↩️ [TOKEN REFRESH] Retrying original request with new token`);
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error(`[${getTimestamp()}] ❌ [TOKEN REFRESH] Interceptor error:`, refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// =======================
// REFRESH TOKEN FUNCTION
// =======================
const refreshAccessToken = async (): Promise<string | null> => {
  try {
    let refresh_token = null;
    try {
      refresh_token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (e) {
      console.log("SecureStore get REFRESH_TOKEN_KEY error, using fallback:", e);
    }
    if (!refresh_token) {
      refresh_token = await AsyncStorage.getItem("refresh_token_fallback");
    }

    if (!refresh_token) {
      console.warn(`[${getTimestamp()}] ⚠️ [TOKEN REFRESH] No refresh token available`);
      return null;
    }

    console.log(`[${getTimestamp()}] 🔄 [TOKEN REFRESH] Current refresh token: ${getTokenPrefix(refresh_token)}`);
    console.log(`[${getTimestamp()}] 📡 [TOKEN REFRESH] Request: POST /auth/refresh-token`);

    const refreshApi = axios.create({
      baseURL: BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const response = await refreshApi.post("/auth/refresh-token", {
      refresh_token,
    });

    // ✅ Ambil token dari nested data
    const access_token = response.data?.data?.access_token || null;
    const newrefresh_token =
      response.data?.data?.refresh_token || refresh_token;

    console.log(`[${getTimestamp()}] 🔑 [TOKEN REFRESH] Response:`, response.data);

    // Simpan hanya jika string
    if (access_token && typeof access_token === "string") {
      try {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access_token);
      } catch (e) {
        console.log("SecureStore set ACCESS_TOKEN_KEY error:", e);
      }
      await AsyncStorage.setItem("access_token_fallback", access_token);
      console.log(`[${getTimestamp()}] ✅ [TOKEN REFRESH] New access token stored: ${getTokenPrefix(access_token)}`);
    }
    if (newrefresh_token && typeof newrefresh_token === "string") {
      try {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newrefresh_token);
      } catch (e) {
        console.log("SecureStore set REFRESH_TOKEN_KEY error:", e);
      }
      await AsyncStorage.setItem("refresh_token_fallback", newrefresh_token);
      if (newrefresh_token !== refresh_token) {
        console.log(`[${getTimestamp()}] 🔄 [TOKEN REFRESH] Token rotated!`);
        console.log(`[${getTimestamp()}]    Old: ${getTokenPrefix(refresh_token)}`);
        console.log(`[${getTimestamp()}]    New: ${getTokenPrefix(newrefresh_token)}`);
      } else {
        console.log(`[${getTimestamp()}] ℹ️ [TOKEN REFRESH] Refresh token unchanged`);
      }
    }

    console.log(`[${getTimestamp()}] ✅ [TOKEN REFRESH] Success! Tokens refreshed at ${getTimestamp()}`);
    return access_token;
  } catch (error: any) {
    console.error(`[${getTimestamp()}] ❌ [TOKEN REFRESH] Failed:`, error);
    // Only clear tokens if the server explicitly rejected the refresh token (400, 401, 403, 404)
    if (error.response && [400, 401, 403, 404].includes(error.response.status)) {
      console.warn(`[${getTimestamp()}] 🚨 [TOKEN REFRESH] Invalid token response (${error.response.status}), clearing tokens`);
      await clearTokens();
    } else {
      console.log(`[${getTimestamp()}] ℹ️ [TOKEN REFRESH] Network or server error, keeping tokens for retry`);
    }
    return null;
  }
};


// =======================
// CLEAR TOKENS
// =======================
const clearTokens = async (): Promise<void> => {
  try {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync("user"),
      ]);
    } catch (e) {
      console.log("SecureStore delete tokens error:", e);
    }
    await Promise.all([
      AsyncStorage.removeItem("access_token_fallback"),
      AsyncStorage.removeItem("refresh_token_fallback"),
    ]);
    console.log(`[${getTimestamp()}] 🗑️ [TOKEN CLEAR] All tokens cleared`);
    DeviceEventEmitter.emit('auth-unauthorized');
  } catch (error) {
    console.error(`[${getTimestamp()}] ❌ [TOKEN CLEAR] Error:`, error);
  }
};

export { refreshAccessToken, clearTokens, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };
export default api;
