import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import api, { setAuthToken } from "../api";

const storage = Platform.OS === "web"
  ? {
      getItemAsync: (k) => Promise.resolve(localStorage.getItem(k)),
      setItemAsync: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
      deleteItemAsync: (k) => Promise.resolve(localStorage.removeItem(k)),
    }
  : require("expo-secure-store");

function notifyElectron(token) {
  if (typeof window !== "undefined" && window.electronBridge) {
    if (token) {
      window.electronBridge.setAuthToken(token);
    } else {
      window.electronBridge.clearAuthToken();
    }
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        const storedToken = await storage.getItemAsync("np_token");
        const storedRefresh = await storage.getItemAsync("np_refresh_token");
        const storedUser = await storage.getItemAsync("np_user");

        if (storedToken) setToken(storedToken);
        if (storedRefresh) setRefreshToken(storedRefresh);
        if (storedUser) setUser(JSON.parse(storedUser));
      } catch (err) {
        console.warn("Failed to load auth state", err);
      } finally {
        setReady(true);
      }
    }
    loadAuth();
  }, []);

  useEffect(() => {
    setAuthToken(token);
    notifyElectron(token);

    if (token) storage.setItemAsync("np_token", token).catch(() => {});
    else storage.deleteItemAsync("np_token").catch(() => {});
  }, [token]);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      async (err) => {
        const original = err.config || {};
        if (err.response?.status === 401 && !original._retried && refreshToken) {
          original._retried = true;
          try {
            const { data } = await api.post(
              '/api/auth/refresh',
              {},
              { headers: { Authorization: `Bearer ${refreshToken}` } }
            );
            if (data?.access_token) {
              setToken(data.access_token);
              setAuthToken(data.access_token);
              original.headers = { ...(original.headers || {}), Authorization: `Bearer ${data.access_token}` };
              return api(original);
            }
          } catch {}
        }
        if (err.response?.status === 401 && original.url !== '/api/auth/login') {
        }
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [refreshToken]);

  useEffect(() => {
    if (refreshToken) storage.setItemAsync("np_refresh_token", refreshToken).catch(() => {});
    else storage.deleteItemAsync("np_refresh_token").catch(() => {});
  }, [refreshToken]);

  useEffect(() => {
    if (user) storage.setItemAsync("np_user", JSON.stringify(user)).catch(() => {});
    else storage.deleteItemAsync("np_user").catch(() => {});
  }, [user]);

  async function login(email, password) {
    const { data } = await api.post("/api/auth/login", { email, password });
    setToken(data.access_token);
    if (data.refresh_token) setRefreshToken(data.refresh_token);
    setUser(data.user);
    return data;
  }

  async function register(payload) {
    const { data } = await api.post("/api/auth/register", payload);
    setToken(data.access_token);
    if (data.refresh_token) setRefreshToken(data.refresh_token);
    setUser(data.user);
    return data;
  }

  function logout() {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, refreshToken, user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
