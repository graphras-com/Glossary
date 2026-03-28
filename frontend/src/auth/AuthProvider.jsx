/**
 * Top-level MSAL authentication provider.
 *
 * Wraps the application in MsalProvider and handles:
 * - MSAL instance initialisation
 * - Loading state while MSAL initialises
 * - Setting the active account on login success
 *
 * Uses popup-based login so tokens can remain in memory only
 * (redirect flow is incompatible with memoryStorage).
 *
 * Set VITE_AUTH_DISABLED=true to bypass MSAL entirely (tests / local dev).
 */

import { EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { useEffect, useState } from "react";
import { msalInstance } from "./msalInstance";

export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "true";

/**
 * Set the active account so that silent token acquisition works.
 */
function setActiveAccountIfNeeded(instance) {
  const accounts = instance.getAllAccounts();
  if (accounts.length > 0 && !instance.getActiveAccount()) {
    instance.setActiveAccount(accounts[0]);
  }

  // Listen for login success events and set the active account
  instance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
      instance.setActiveAccount(event.payload.account);
    }
  });
}

export default function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(AUTH_DISABLED);

  useEffect(() => {
    if (AUTH_DISABLED) return;

    msalInstance
      .initialize()
      .then(() => {
        setActiveAccountIfNeeded(msalInstance);
        setIsReady(true);
      })
      .catch((error) => {
        console.error("MSAL initialization failed:", error);
        setIsReady(true); // still render so the error page can show
      });
  }, []);

  if (!isReady) {
    return (
      <div className="loading">
        <p>Initialising authentication...</p>
      </div>
    );
  }

  if (AUTH_DISABLED) {
    return children;
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
