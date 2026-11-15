# FaZe Ecosystem Graph

A temporal, provenance-aware graph of creators, teams, content, campaigns, sponsors, audiences and revenue.
Route: `http://localhost:3002/ecosystem` (Signal Lab, nav item **Ecosystem**). It extends the existing Signal Lab app and
reuses `react-force-graph-2d`. The MiroFish dashboard (`/`) and `GraphView.tsx` are unchanged.

## Question it answers

> Who was connected to which FaZe business unit, creator, team, game, content format, audience, sponsor and commercial
> outcome at a particular point in time?

## Data model (`apps/signal-lab-web/lib/graph/types.ts`)

| Concept | Rule |
| --- | --- |
| **Person** | One canonical node per human (`person:rain-nordan`, `person:rain-havard`). IDs are stable, never display names. Roles, teams and orgs hang off the person through relationships. |
| **Identity collisions** | Nordan "FaZe Rain" Shat (creator) and Håvard "rain" Nygaard (CS) are separate nodes, each with a `disambiguation` note. FaZe Twistt (2012 trickshotter) is separate from Russel "Twistzz" Van Dulken. The bare alias `rain` resolves as *ambiguous* and the UI asks which one. |
| **Complex relationships** | Intermediate entities: `RoleAssignment` (Person → HAS_ASSIGNMENT → RoleAssignment → AT → Org/Team), `OwnershipStake` (Holder → HOLDS_STAKE_IN → Stake → OF → Target), `CampaignParticipation`. |
| **TemporalProperties** | `validFrom`, `validTo`, `observedAt`, `sourceId`, `confidence`, `status` (+ `datePrecision`, `note`). Intervals are half-open: `validFrom <= t < validTo`. Open end = `null`. |
| **History** | Nothing is overwritten. Ended things get `validTo` (`closeRelationship`). A new relationship is created for what follows. |
| **Causation** | There is no `CAUSED_BY`. Chronology uses `PRECEDED` / `FOLLOWED_BY`, soft links use `ASSOCIATED_WITH` / `AFFECTED`. |
| **Source / Claim** | Every relationship names a `sourceId`. Claims group a statement with one or more sources and appear in the Evidence layer. |
| **MetricObservation** | Point observations: views, prizes, revenue, valuation. `status: "mock"` marks invented demo values. |

### Status vocabulary

`verified` (primary or official source) · `reported` (press or secondary) · `inferred` (analyst link, drawn dashed) ·
`disputed` · `mock` (invented demo value) · `simulated` (MiroFish output).

### Observed vs simulation

* **Observed graph**: facts and measurements. Lives in the provider's observed store.
* **Simulation graph**: a `SimulationScenario` (`scenarioId`, `graphSnapshotId`, `predictedOutcomes`, `affectedCohorts`,
  `recommendedCreators`, `simulatedNodes`, `simulatedEdges`). It is loaded with `loadSimulation()` and is never merged
  into the observed store. `applyEvent()` rejects anything marked `simulated` (`SimulatedDataRejected`).
* **Mode control**: *Observed* hides simulation. *Simulation* shows the scenario plus only the observed nodes it touches.
  *Compare* shows both; simulated nodes have an amber dashed ring and simulated edges are dashed amber.
* A scenario only appears at dates on or after its snapshot. Before that the UI says so.

## Provider interface

`GraphDataProvider` is the only thing the UI imports.

```ts
getSnapshot(asOf | "current"): Promise<GraphSnapshot>     // observed only, valid at that date
getNodeHistory(id): Promise<NodeHistory | null>           // all-time roles, stakes, metrics for the details panel
search(q) / resolveAlias(q)                               // alias -> canonical node, ambiguity flagged
applyEvent(event): Promise<EventLogEntry>                 // incremental update, observed store only
loadSimulation(id): Promise<SimulationScenario>           // separate from the fact store
subscribe(listener) / getEventLog()
```

`MockGraphDataProvider` (in-memory, seeded from the FaZe timeline) is the demo implementation. Extension points for a
real backend are documented in `mockProvider.ts`:

* **Neo4j**: `getSnapshot` becomes a Cypher query with `r.validFrom <= $asOf AND (r.validTo IS NULL OR r.validTo > $asOf)`.
  `applyEvent` becomes a consumer of the live feed that `MERGE`s nodes and sets `validTo` on ended relationships.
* **Postgres**: the repo already has `lore.entities`, `lore.aliases` and `lore.facts` (`valid`, `known_from`,
  `confidence`, `source_url`). They map directly onto `GraphNode`, aliases and `TemporalProperties`.
* **Simulation**: read MiroFish results from the Signal Lab API (`/v1/mirofish/*`) into a `SimulationScenario`.

## Seed data

`lib/graph/seed/` is built from the compiled timeline "FaZe Clan: A Timeline, 2010–2026". About 250 nodes and 410
relationships, including every person, team, brand and event you listed.

* Dates, view counts, prizes, ownership percentages and valuations come from the timeline and cite a source.
* Where the timeline gives only a month or year, `datePrecision` says so.
* Where a start or end is not in the timeline, the record is `reported` or `inferred` with a `note` (for example the
  Fortnite roster's closing date, or Temperrr's current assignment).
* **Audience cohorts, narratives and every link to them are analyst-inferred** (`src-inference`, dashed). They are not measured.
* **Three metrics are invented demo values** and labelled `MOCK` in the UI: merch conversion, nostalgia sentiment, merch revenue.
* The simulation scenario's values are mock.

Demonstrated scenarios: a creator with several roles (Banks: creator, COO, CEO at two entities, 25.5% stakeholder); similar
aliases (rain / FaZe Rain, Twistt / Twistzz); a creator departure (Adapt, 25 Dec 2025, then CORE); a roster change
(karrigan, ropz, s1mple loan, rain benched); a corporate ownership change (FaZe Holdings → GameSquare → FaZe Media /
FaZe Esports → Kalish, Gigamoon, HardScope); a sponsor campaign (Rollbit, $3.25M/yr); an esports win linked to content
(EWC 2026 R6 → "Let's talk about the stars", 644K views); content linked to an audience cohort; a campaign linked to a
commercial metric; a simulated campaign recommendation.

## Using it (demo flow)

1. **Search** a creator or alias ("FaZe Rain", "House Cat", "Banks"). Aliases resolve to the canonical person.
2. The **details panel** lists current and historical roles, aliases, active dates, connected teams, content and
   campaigns, metrics, sources and confidence.
3. **Move the "As of" slider** back. Roles that ended reappear; things that did not exist yet disappear. **Current** returns.
4. Select an esports or content event, then **Path from here → Nearest audience**.
5. Select the cohort, **Path from here → Nearest revenue**. Dashed hops are inferred or mock, and the panel says so.
6. Switch to **Simulation** (or **Compare**) to see the proposed campaign's predicted links and outcomes.
7. **Demo stream**: *Next event* or *Play* applies labelled demo events (signing, video, live stream, campaign, tournament
   win, metric update, departure). *Pause* and *Reset* work. Demo nodes carry a dotted green ring and `MOCK` status.

Other controls: layer filters (Talent, Organizations, Esports, Content, Campaigns & commerce, Audiences & narratives,
Evidence), second-degree expansion, relationship labels, **Find connection** between any two nodes, and a keyboard-
accessible node browser under the canvas.

### Metrics shown for a selected node

Degree; bridge score (betweenness, normalised to the busiest node in the current view); cohorts within 3 hops; revenue
measurements within 4 hops; dependency risk (share of cohort and revenue nodes that lose their connection to FaZe Clan if
the node is removed). Dependency risk is structural, not a financial estimate.

## Tests and checks

```
cd apps/signal-lab-web
npm test            # 32 unit tests: temporal filtering, aliases, observed/simulated separation, events, paths, performance
npm run typecheck
NEXT_DIST_DIR=.next-build npx next build
PW_REUSE=1 npx playwright test e2e/ecosystem.spec.ts      # against a live `make dev`
```
