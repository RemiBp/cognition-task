import { DEMO_CASE_ID, DEMO_CASE_REFERENCE, DEMO_CUSTOMER, DEMO_EVIDENCE } from "@/platform/demo";
import type { Actor } from "@/platform/rbac";

/** The four demo identities. Ids are stable so scripts and tests can act as them. */
export const PEOPLE = {
  dana: {
    id: "user-dana",
    email: "dana.viewer@northwindpay.com",
    name: "Dana Reyes",
    role: "viewer",
  },
  sam: {
    id: "user-sam",
    email: "sam.analyst@northwindpay.com",
    name: "Sam Okonjo",
    role: "analyst",
  },
  priya: {
    id: "user-priya",
    email: "priya.approver@northwindpay.com",
    name: "Priya Raman",
    role: "approver",
  },
  alex: {
    id: "user-alex",
    email: "alex.admin@northwindpay.com",
    name: "Alex Fournier",
    role: "admin",
  },
} satisfies Record<string, Actor>;

/**
 * Clearly synthetic and deterministic. It is seeded pending: the escalation and
 * the maker-checker approval only happen if `npm run demo:journey` is run.
 */
export function demoCase() {
  return {
    id: DEMO_CASE_ID,
    reference: DEMO_CASE_REFERENCE,
    customerName: DEMO_CUSTOMER,
    country: "FR",
    riskScore: 76,
    documentType: "passport",
    status: "pending",
    isDemo: true,
    evidenceSummary: DEMO_EVIDENCE,
    notes: "Walkthrough case used by the README and by npm run demo:journey.",
  };
}
