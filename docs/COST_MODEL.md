# Cost model

All Power Apps list prices below are Microsoft's public per-user prices at the time of writing; the client's actual contract may differ.

## Where the $250K goes

| Line | List price | Note |
| --- | --- | --- |
| Power Apps Premium | $20 / user / month | $12 at 2,000+ seats |
| Power Apps per-app | $5 / user / app / month | cheap per app, multiplies with app count |
| Dataverse capacity, premium connectors, managed environments | add-on | usually the surprise line |

$250K/year ≈ **~1,000 Premium seats**, or a mix of per-app licenses plus capacity. The important consequence: the bill scales with the number of *tool users* — ops, compliance, support, finance — not with the 60 engineers.

## What 13 apps does to each option

**Buy.** Under per-app licensing, cost grows roughly with (users × apps). Ten more tools rolled out to overlapping ops populations is the scenario where the per-app model pushes you onto Premium seats for everyone, i.e. a step change, not a gradual one.

**Build.** Cost is dominated by a fixed platform cost, not per-app cost:

| Line | Estimate | Note |
| --- | --- | --- |
| Platform ownership | ~1 loaded engineer (~$250K/yr) | auth, upgrades, on-call, incident response |
| Hosting + Postgres | low five figures/yr | at internal-tool traffic |
| Marginal cost per new tool | ~1 Devin session + 1 code review | the number that actually changes the decision |
| Migration of the 3 existing apps | one-off, days not months | they are thin on either platform |

## The honest conclusion

The license saving roughly funds the platform engineer. **Build-vs-buy here is not automatically a cost-reduction decision.** It becomes economically plausible in the 10+ app world, but the marginal cost is low only for tools that fit the shared CRUD/workflow conventions. Novel integrations, controls and operating work remain real costs.

The defensible reasons to build are control, correctness at data scale, testability, and customization. If the client's board is told "we saved $250K", that claim will not survive the first year.
