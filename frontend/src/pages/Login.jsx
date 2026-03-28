/**
 * Login page shown to unauthenticated users.
 *
 * Provides a "Sign in with Microsoft" button that triggers the
 * MSAL popup login flow (Authorization Code + PKCE).
 * Popup is used instead of redirect so tokens can stay in memory only.
 */

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../auth/msalConfig";

export default function Login() {
  const { instance } = useMsal();
  const [error, setError] = useState(null);

  const handleLogin = () => {
    setError(null);
    instance
      .loginPopup(loginRequest)
      .then((response) => {
        if (response?.account) {
          instance.setActiveAccount(response.account);
        }
      })
      .catch((err) => {
        // User closed the popup or something went wrong
        if (err.errorCode !== "user_cancelled") {
          console.error("Login failed:", err);
          setError(err.errorMessage || "Login failed. Please try again.");
        }
      });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Telecom Glossary</h1>
        <p>
          Sign in with your company Microsoft account to access the glossary.
        </p>
        {error && <div className="error-message">{error}</div>}
        <button className="btn btn-primary btn-login" onClick={handleLogin}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
