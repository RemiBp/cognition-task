export const ROLES = ["viewer", "analyst", "approver", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer — read-only",
  analyst: "Analyst — can propose decisions",
  approver: "Approver — can decide on proposals",
  admin: "Admin — platform administration",
};

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

/**
 * Platform-level permissions. Per-app action permissions are declared next to
 * the action itself (see platform/actions.ts) so that adding an app never
 * means editing a central god-object.
 */
const PLATFORM_PERMISSIONS: Record<string, readonly Role[]> = {
  "approval.decide": ["approver", "admin"],
  "audit.read": ["viewer", "analyst", "approver", "admin"],
};

export function can(actor: Actor, permission: string): boolean {
  const allowed = PLATFORM_PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(actor.role);
}

export function requireCan(actor: Actor, permission: string): void {
  if (!can(actor, permission)) {
    throw new PolicyError(
      `${actor.email} (${actor.role}) is not permitted to ${permission}`,
    );
  }
}
