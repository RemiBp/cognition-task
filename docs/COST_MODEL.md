# Cost model

All Power Apps list prices below are Microsoft's public US prices, read from the pricing page on 2026-09-03; the client's contract, region, market and entitlements may differ, and the page itself shows different prices per market. Source: [Microsoft Power Apps pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing) and [Power Platform licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq).

List price is not what the client pays. Nothing below should be used as an estimate of their bill; the numbers to use are the ones in their own agreement.

## Where the $250K goes

| Line | List price | Note |
| --- | --- | --- |
| Power Apps Premium | $22 / user / month, paid yearly | $14 with a 2,000-seat minimum |
| Dataverse Database capacity add-on | $40 / GB / month, paid yearly | pooled at tenant level, model separately from seat count |
| Per-app licensing | not listed on the public pricing page | legacy or contract-dependent; price it from the client's own agreement |

At list, $250K/year is in the order of 950 Premium seats, or fewer seats plus capacity add-ons. That arithmetic only frames the shape of the bill and is not a claim about this client's contract. The shape is what matters: the bill scales with the number of *tool users*, meaning ops, compliance, support and finance, not with the 60 engineers.

## What 13 apps does to each option

**Buy.** This depends entirely on which licensing the client is actually on, and the two behave in opposite ways.

- *Premium, per licensed user.* A Premium user may run unlimited apps. Going from 3 apps to 13 for the same assigned users adds no license cost at all. What grows the bill is more people using the tools, and Dataverse capacity.
- *Per-app or contract-specific licensing.* Cost grows roughly with (users × apps), so the same ten tools are a step change. Wide rollouts under this model are the case that pushes an organisation onto Premium for everyone.

So the ten new apps do not automatically increase license cost, and dropping Power Apps does not automatically save money. Both directions have to be priced from the client's actual contract: which licenses, how many, which are avoidable if the workflows move, and what Dataverse and connector capacity they carry.

**Build.** Cost is dominated by a fixed platform cost, not per-app cost:

| Line | Estimate | Note |
| --- | --- | --- |
| Platform ownership | Named owner plus on-call capacity | auth, upgrades, incidents, controls and roadmap |
| Hosting + Postgres | Architecture-dependent | traffic is only one driver; resilience and compliance matter |
| New CRUD-shaped tool | Lower scaffolding effort | implementation, integration, review and operations remain |
| Migration of the 3 existing apps | One-off discovery and delivery | estimate only after mapping integrations and controls |

## The honest conclusion

The comparison that decides this is the client's avoidable contract cost, meaning the licenses and capacity they could actually stop paying for if a given set of workflows moved, against the full cost of owning the replacement: platform ownership, hosting, security and compliance work, migration and ongoing operations. Neither side of that comparison is known from public prices. **Build-vs-buy here is not automatically a cost-reduction decision.** It becomes more plausible across a larger roadmap, but only tools that fit shared CRUD/workflow conventions receive the full reuse benefit. Novel integrations, controls and operating work remain real costs.

The defensible reasons to build are control, correctness at data scale, testability, and customization. If the client's board is told "we saved $250K", that claim will not survive the first year.
