const STAFF_PORTAL_PATH = "/mod/roster";

/** The only roles that can enter the personal-device staff console. */
export function isStaffRole(role?: string | null): boolean {
  return role === "MODERATOR" || role === "CUSTODIAN";
}

export function isCustodianRole(role?: string | null): boolean {
  return role === "CUSTODIAN";
}

export function getStaffPortalPath(role?: string | null): string | null {
  return isStaffRole(role) ? STAFF_PORTAL_PATH : null;
}

function getSafeInternalPath(next?: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}

/** Resolve the destination after email/password sign-in. */
export function resolvePostLoginPath(
  role?: string | null,
  next?: string | null,
): string {
  return getSafeInternalPath(next) ?? getStaffPortalPath(role) ?? "/";
}
