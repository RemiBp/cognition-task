# Cost model

Public list prices differ by market and by when the page is read, so none are quoted here. The basis for any number in this comparison is the client's own agreement. Sources for the licensing shape: [Microsoft Power Apps pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing) and [Power Platform licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq).

The $250K/year is the figure given with the scenario. It is a bill, not a saving, and no breakdown of the client's contract has been supplied.

## What to verify in the contract

| Line | What to read from the agreement |
| --- | --- |
| Power Apps Premium | how many users are assigned, which of them actually use the tools, and the unit price actually paid |
| Dataverse capacity and add-ons | the entitlements included, consumption against them, and what is charged beyond them |
| Per-app or contract-specific terms | which users and which apps are charged, and what commitments or minimums apply |

What the shape tells us without any of those numbers: the bill scales with the number of *tool users*, meaning ops, compliance, support and finance, not with the 60 engineers.

## What 13 apps does to each option

**Buy.** This depends entirely on which licensing the client is actually on, and the licence model matters.

- *Premium, per licensed user.* A Premium user may run unlimited apps. Going from 3 apps to 13 for the same assigned users adds no license cost at all. What grows the bill is more people using the tools, and Dataverse capacity.
- *Per-app or contract-specific licensing.* Cost grows roughly with (users × apps), so the same ten tools are a step change. Wide rollouts under this model are the case that pushes an organisation onto Premium for everyone.

So the ten new apps do not automatically increase license cost, and dropping Power Apps does not automatically save money. Both directions have to be priced from the client's actual contract: which licenses, how many, which are avoidable if the workflows move, and what Dataverse and connector capacity they carry.

**Build.** The planning assumption is that a fixed platform cost dominates, so budget both shared ownership and the integration, review and delivery work each workflow carries:

| Line | Estimate | Note |
| --- | --- | --- |
| Platform ownership | Named owner plus on-call capacity | auth, upgrades, incidents, controls and roadmap |
| Hosting + Postgres | Architecture-dependent | traffic is only one driver; resilience and compliance matter |
| New CRUD-shaped tool | Lower scaffolding effort | implementation, integration, review and operations remain |
| Migration of the 3 existing apps | One-off discovery and delivery | estimate only after mapping integrations and controls |

## The honest conclusion

The comparison that decides this is the client's avoidable contract cost, meaning the licenses and capacity they could actually stop paying for if a given set of workflows moved, against the full cost of owning the replacement: platform ownership, hosting, security and compliance work, migration and ongoing operations. Neither side of that comparison is known from public prices. **Build-vs-buy here is not automatically a cost-reduction decision.** It becomes more plausible across a larger roadmap, but only tools that fit shared CRUD/workflow conventions receive the full reuse benefit. Novel integrations, controls and operating work remain real costs.

The defensible reasons to build are control, correctness at data scale, testability, and customization. Do not present the $250K licence bill as net savings without accounting for ownership costs.
