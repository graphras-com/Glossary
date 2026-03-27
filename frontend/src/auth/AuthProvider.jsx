/**
 * Top-level MSAL authentication provider.
 *
 * Wraps the application in MsalProvider and handles:
 * - MSAL instance initialisation
 * - Redirect promise handling (for redirect-based login flows)
 * - Loading state while MSAL initialises
 */

import { EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { useEffect, useState } from "react";
import { msalInstance } from "./msalInstance";

/**
 * After a redirect login, MSAL needs to process the response.
 * Set the active account so that silent token acquisition works.
 */
function handleRedirectAndSetAccount(instance) {
  const accounts = instance.getAllAccounts();
  if (accounts.length > 0) {
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
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then(() => {
        handleRedirectAndSetAccount(msalInstance);
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

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
