/**
 * Route guard component that requires authentication.
 *
 * Wraps routes that should only be accessible to authenticated users.
 * If the user is not authenticated, renders the Login page instead.
 * While authentication state is loading, shows a loading indicator.
 */

import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import Login from "../pages/Login";

export default function RequireAuth({ children }) {
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
