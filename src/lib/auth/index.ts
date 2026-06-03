import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { modpacksPlugin } from "./plugins/modpacks";

const BEARER_TOKEN_KEY = "sf_bearer_token";

export const authClient = createAuthClient({
  baseURL: "https://vsapi.betterjs.dev",
  plugins: [modpacksPlugin(), usernameClient()],
  sessionOptions: {
    refetchOnWindowFocus: false,
    refetchWhenOffline: false,
    refetchInterval: 0,
  },
  fetchOptions: {
    // Automatically attach Bearer token from localStorage to every request.
    // No cookies needed — works reliably in Tauri's WebView.
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem(BEARER_TOKEN_KEY) ?? "",
    },
    // After any API call, if the server sends a new auth token (sign-in, session refresh),
    // store it. If the server sends an empty/expired token, clear it.
    onSuccess: (ctx) => {
      const newToken = ctx.response.headers.get("set-auth-token");
      if (newToken) {
        localStorage.setItem(BEARER_TOKEN_KEY, newToken);
      } else if (ctx.response.headers.has("set-auth-token")) {
        // Header present but empty — session ended
        localStorage.removeItem(BEARER_TOKEN_KEY);
      }
    },
  },
});

/** Manually clear the auth token (e.g. on explicit sign-out). */
export function clearAuthToken(): void {
  localStorage.removeItem(BEARER_TOKEN_KEY);
}
