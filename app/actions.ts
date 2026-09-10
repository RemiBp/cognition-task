"use server";

import { revalidatePath } from "next/cache";
import "@/platform/registry";
import { execute, type ExecuteResult } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { getActor, setActor } from "@/platform/auth";
import { ConflictError, PolicyError } from "@/platform/rbac";
import { z } from "zod";

export async function switchUser(userId: string) {
  await setActor(userId);
  revalidatePath("/", "layout");
}

/**
 * A replay returns the request the first delivery created, whatever has since
 * happened to it, so the message has to read its actual status: describing a
 * rejected request as awaiting approval would be a lie the user acts on.
 */
function replayText(result: Extract<ExecuteResult, { status: "proposed" }>): string {
  if (!result.reused) return "Proposed. It is awaiting independent approval by someone else.";
  if (result.requestStatus === "approved") {
    return "This request was already submitted and has since been approved. Nothing was submitted twice.";
  }
  if (result.requestStatus === "rejected") {
    return "This request was already submitted and has since been rejected. Nothing was submitted twice; review the case before proposing again.";
  }
  return "This proposal was already open; it is awaiting independent approval.";
}

/**
 * Server functions are reachable by direct POST, so nothing here trusts what
 * the browser sent: the payload is revalidated, the actor comes from the
 * session, and `execute()` re-runs the policy before writing.
 */
export async function runAction(
  actionKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; text: string }> {
  const actor = await getActor();
  try {
    const result = await execute(actionKey, payload, actor);
    revalidatePath("/", "layout");
    if (result.status !== "proposed") {
      return { ok: true, text: "Applied and written to the audit log." };
    }
    return { ok: true, text: replayText(result) };
  } catch (error) {
    if (error instanceof PolicyError || error instanceof ConflictError) {
      return { ok: false, text: error.message };
    }
    return { ok: false, text: (error as Error).message };
  }
}

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ ok: boolean; text: string }> {
  const actor = await getActor();
  try {
    const input = z
      .object({
        approvalId: z.string().min(1),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse({ approvalId, decision, note: note || undefined });
    await decide(input.approvalId, input.decision, actor, input.note);
    revalidatePath("/", "layout");
    return { ok: true, text: `Proposal ${decision}.` };
  } catch (error) {
    if (error instanceof PolicyError || error instanceof ConflictError) {
      return { ok: false, text: error.message };
    }
    return { ok: false, text: (error as Error).message };
  }
}
