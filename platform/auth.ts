import { cookies } from "next/headers";
import { db } from "./db";
import type { Actor, Role } from "./rbac";

const SESSION_COOKIE = "itp_session_user";

/**
 * The seam an OIDC provider plugs into.
 *
 * In production this reads a signed session established by an OIDC callback
 * (Entra ID, Okta, Auth0) and maps IdP group claims onto platform roles. The
 * prototype instead resolves the demo user selected in the header, so the
 * role model can be exercised without a tenant. Everything downstream of this
 * function — policies, approvals, audit — is production shaped.
 */
export async function getActor(): Promise<Actor> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;

  const user =
    (id ? await db.user.findUnique({ where: { id } }) : null) ??
    (await db.user.findFirst({ where: { role: "analyst" } }));

  if (!user) {
    throw new Error("No users in database — run `npm run db:seed`.");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}

export async function setActor(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}
