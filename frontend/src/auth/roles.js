/**
 * RBAC role constants and helpers for the Glossary application.
 *
 * These roles must match the App Roles defined in the Entra API
 * app registration manifest.
 */

/** Role that grants full read/write access including backup/restore */
export const ROLE_ADMIN = "Glossary.Admin";

/** Role that grants read/write access to terms, categories, definitions */
export const ROLE_EDITOR = "Glossary.Editor";

/** Role that grants read-only access */
export const ROLE_READER = "Glossary.Reader";

/**
 * Check if the user's token claims include at least one of the given roles.
 *
 * @param {object} account - MSAL account object (from useMsal)
 * @param {string[]} requiredRoles - roles to check (any match = authorized)
 * @returns {boolean}
 */
export function hasRole(account, ...requiredRoles) {
  const userRoles = account?.idTokenClaims?.roles ?? [];
  return requiredRoles.some((role) => userRoles.includes(role));
}

/**
 * Check if the user has admin privileges.
 *
 * @param {object} account - MSAL account object
 * @returns {boolean}
 */
export function isAdmin(account) {
  return hasRole(account, ROLE_ADMIN);
}
