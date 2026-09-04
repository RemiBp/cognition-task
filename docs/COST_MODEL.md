# Cost model

All Power Apps list prices below are Microsoft's public US prices at the time of writing; the client's contract, region and entitlements may differ. Source: [Microsoft Power Apps pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing) and [Power Platform licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq).

## Where the $250K goes

| Line | List price | Note |
| --- | --- | --- |
| Power Apps Premium | $22 / user / month, paid yearly | $14 with a 2,000-seat minimum |
| Dataverse Database capacity add-on | $40 / GB / month, paid yearly | pooled at tenant level, model separately from seat count |
| Per-app licensing | not listed on the public pricing page | legacy or contract-dependent; price it from the client's own agreement |

$250K/year ≈ **~950 Premium seats at list**, or fewer seats plus capacity add-ons. The important consequence: the bill scales with the number of *tool users*, meaning ops, compliance, support and finance, not with the 60 engineers.

## What 13 apps does to each option

**Buy.** Where per-app licensing is in play, cost grows roughly with (users × apps). Ten more tools rolled out to overlapping ops populations is the scenario that pushes you onto Premium seats for everyone, i.e. a step change, not a gradual one. Past 2,000 seats the $14 tier softens that step, so the crossover depends on how wide the rollout goes.

**Build.** Cost is dominated by a fixed platform cost, not per-app cost:

| Line | Estimate | Note |
| --- | --- | --- |
| Platform ownership | Named owner plus on-call capacity | auth, upgrades, incidents, controls and roadmap |
| Hosting + Postgres | Architecture-dependent | traffic is only one driver; resilience and compliance matter |
| New CRUD-shaped tool | Lower scaffolding effort | implementation, integration, review and operations remain |
| Migration of the 3 existing apps | One-off discovery and delivery | estimate only after mapping integrations and controls |

## The honest conclusion

The avoided license cost may be of the same order as meaningful platform ownership, but the client-specific numbers are not known. **Build-vs-buy here is not automatically a cost-reduction decision.** It becomes more plausible across a larger roadmap, but only tools that fit shared CRUD/workflow conventions receive the full reuse benefit. Novel integrations, controls and operating work remain real costs.

The defensible reasons to build are control, correctness at data scale, testability, and customization. If the client's board is told "we saved $250K", that claim will not survive the first year.
