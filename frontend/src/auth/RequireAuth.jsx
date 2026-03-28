/**
 * Route guard component that requires authentication.
 *
 * Wraps routes that should only be accessible to authenticated users.
 * If the user is not authenticated, renders the Login page instead.
 * While authentication state is loading, shows a loading indicator.
 *
 * When VITE_AUTH_DISABLED=true the guard is a no-op pass-through.
 */

import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import Login from "../pages/Login";
import { AUTH_DISABLED } from "./AuthProvider";

function AuthenticatedGuard({ children }) {
  const { inProgress } = useMsal();

  // Show loading while MSAL is handling a redirect or other interaction
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="loading">
        <p>Authenticating...</p>
      </div>
    );
  }

  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <Login />
      </UnauthenticatedTemplate>
    </>
  );
}

export default function RequireAuth({ children }) {
  if (AUTH_DISABLED) {
    return children;
  }

  return <AuthenticatedGuard>{children}</AuthenticatedGuard>;
}
