# Cost model

All Power Apps list prices below are Microsoft's public US prices at the time of writing; the client's contract, region and entitlements may differ. Source: [Microsoft Power Apps pricing](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing) and [Power Platform licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq).

## Where the $250K goes

| Line | List price | Note |
| --- | --- | --- |
| Power Apps Premium | $20 / user / month | $12 at 2,000+ seats |
| Power Apps per-app | $5 / user / app / month | cheap per app, multiplies with app count |
| Dataverse capacity and other add-ons | contract-dependent | model separately from seat count |

$250K/year ≈ **~1,000 Premium seats**, or a mix of per-app licenses plus capacity. The important consequence: the bill scales with the number of *tool users* — ops, compliance, support, finance — not with the 60 engineers.

## What 13 apps does to each option

**Buy.** Under per-app licensing, cost grows roughly with (users × apps). Ten more tools rolled out to overlapping ops populations is the scenario where the per-app model pushes you onto Premium seats for everyone, i.e. a step change, not a gradual one.

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
