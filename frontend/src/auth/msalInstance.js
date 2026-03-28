/**
 * Singleton MSAL PublicClientApplication instance.
 *
 * Separated from AuthProvider.jsx to satisfy React Fast Refresh
 * (files exporting components should not also export non-components).
 */

import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

export const msalInstance = new PublicClientApplication(msalConfig);
