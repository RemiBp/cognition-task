"use server";

import { revalidatePath } from "next/cache";
import "@/platform/registry";
import { execute } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { getActor, setActor } from "@/platform/auth";
import { PolicyError } from "@/platform/rbac";

export async function switchUser(userId: string) {
  await setActor(userId);
  revalidatePath("/", "layout");
}

export async function runAction(
  actionKey: string,
  payload: Record<string, unknown>,
  resourceId?: string,
): Promise<{ ok: boolean; text: string }> {
  const actor = await getActor();
  try {
    const result = await execute(actionKey, payload, actor, { resourceId });
    revalidatePath("/", "layout");
    return result.status === "proposed"
      ? {
          ok: true,
          text: "Proposed. A second person holding an approver role has to approve it.",
        }
      : { ok: true, text: "Applied and written to the audit log." };
  } catch (error) {
    if (error instanceof PolicyError) return { ok: false, text: error.message };
    return { ok: false, text: (error as Error).message };
  }
}

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected",
): Promise<{ ok: boolean; text: string }> {
  const actor = await getActor();
  try {
    await decide(approvalId, decision, actor);
    revalidatePath("/", "layout");
    return { ok: true, text: `Proposal ${decision}.` };
  } catch (error) {
    if (error instanceof PolicyError) return { ok: false, text: error.message };
    return { ok: false, text: (error as Error).message };
  }
}
