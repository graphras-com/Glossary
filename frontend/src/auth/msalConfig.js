/**
 * MSAL configuration for Microsoft Entra ID authentication.
 *
 * Uses Authorization Code Flow with PKCE (default for SPA in MSAL v2+).
 * Tokens are stored in memory only (never localStorage/sessionStorage).
 *
 * Environment variables (set via Vite's VITE_ prefix):
 *   VITE_CLIENT_ID   - SPA app registration client ID
 *   VITE_TENANT_ID   - Entra tenant ID (single-tenant)
 *   VITE_API_SCOPE    - API scope, e.g. api://<api-client-id>/access_as_user
 *   VITE_AUTHORITY   - (optional) override authority URL
 */

import { LogLevel } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_CLIENT_ID ?? "";
const tenantId = import.meta.env.VITE_TENANT_ID ?? "";
const authority =
  import.meta.env.VITE_AUTHORITY ??
  `https://login.microsoftonline.com/${tenantId}`;
const apiScope = import.meta.env.VITE_API_SCOPE ?? "";

/**
 * MSAL configuration object.
 * @see https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
export const msalConfig = {
  auth: {
    clientId,
    authority,
    // Popup redirects to a lightweight page that loads MSAL and handles
    // the auth response without mounting the full SPA.
    redirectUri: `${window.location.origin}/auth-popup.html`,
    postLogoutRedirectUri: window.location.origin,
    // Single-tenant: only allow users from this tenant
    knownAuthorities: [authority],
  },
  cache: {
    // Store tokens in memory only (not localStorage/sessionStorage)
    cacheLocation: "memoryStorage",
    // Disable third-party cookie workarounds (not needed with PKCE)
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel:
        import.meta.env.MODE === "development" ? LogLevel.Warning : LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
    },
  },
};

/**
 * Scopes requested when acquiring an access token for the API.
 */
export const apiTokenRequest = {
  scopes: apiScope ? [apiScope] : [],
};

/**
 * Scopes requested during the interactive login.
 * We request the API scope + openid/profile for ID token claims.
 */
export const loginRequest = {
  scopes: apiScope ? [apiScope, "openid", "profile"] : ["openid", "profile"],
};
