/**
 * Login page shown to unauthenticated users.
 *
 * Provides a "Sign in with Microsoft" button that triggers the
 * MSAL redirect login flow (Authorization Code + PKCE).
 */

import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../auth/msalConfig";

export default function Login() {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error("Login failed:", error);
    });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Telecom Glossary</h1>
        <p>
          Sign in with your company Microsoft account to access the glossary.
        </p>
        <button className="btn btn-primary btn-login" onClick={handleLogin}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
