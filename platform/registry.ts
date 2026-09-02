/**
 * Importing this module registers every app's actions. The scaffold generator
 * appends new apps here so that a generated tool is wired into policy,
 * approvals and audit without anyone remembering to do it.
 */
import "@/app/kyc/actions";
import "@/app/refunds/actions";
import "@/app/flags/actions";

export {};
