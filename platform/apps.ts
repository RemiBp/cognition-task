export type AppDescriptor = {
  slug: string;
  name: string;
  purpose: string;
  control: string;
  /** The Power Apps app this replaces, when there is one. */
  replaces?: string;
};

/**
 * The nav registry. `npm run new-app` appends to this list, which is why a new
 * internal tool is one command rather than a checklist.
 */
export const APPS: AppDescriptor[] = [
  {
    slug: "kyc",
    name: "KYC review queue",
    purpose: "Review and decide on customer verification cases.",
    control: "Maker-checker · audited",
    replaces: "Power Apps — KYC review queue",
  },
  {
    slug: "refunds",
    name: "Refunds dashboard",
    purpose: "Approve or reject customer refund requests.",
    control: "Money movement · maker-checker",
    replaces: "Power Apps — Refunds dashboard",
  },
  {
    slug: "flags",
    name: "Feature flag admin",
    purpose: "Toggle product feature flags per environment.",
    control: "Admin only · immediate · audited",
    replaces: "Power Apps — Feature flag admin panel",
  },
  {
    slug: "disputes",
    name: "Disputes queue",
    purpose: "Track and resolve card disputes.",
    control: "Money movement · maker-checker",
  },
];
