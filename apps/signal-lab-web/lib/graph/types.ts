/**
 * FaZe Ecosystem Graph: domain types.
 *
 * Rules the types enforce:
 *  - One canonical Person node per human. Roles, teams and organizations hang off it via relationships.
 *  - Every relationship carries TemporalProperties (valid time + provenance). Ended relationships are closed with
 *    `validTo`, never deleted or overwritten.
 *  - `origin` separates the Observed Graph from the Simulation Graph. Simulated records live only in a
 *    SimulationScenario and are never part of a GraphSnapshot.
 *  - Shapes line up with the `lore` schema (valid range, known_from, confidence, source_url) so a Postgres- or
 *    Neo4j-backed provider can implement GraphDataProvider later.
 */

export type NodeCategory =
  | "person" | "organization" | "team" | "game" | "channel" | "content_asset" | "content_series" | "event"
  | "campaign" | "brand" | "product" | "audience_cohort" | "narrative" | "metric" | "source" | "claim"
  // intermediate entities for complex relationships
  | "role_assignment" | "ownership_stake" | "campaign_participation";

export type Layer = "talent" | "organizations" | "esports" | "content" | "commerce" | "audiences" | "evidence";
export const LAYERS: { id: Layer; label: string }[] = [
  { id: "talent", label: "Talent" },
  { id: "organizations", label: "Organizations" },
  { id: "esports", label: "Esports" },
  { id: "content", label: "Content" },
  { id: "commerce", label: "Campaigns & commerce" },
  { id: "audiences", label: "Audiences & narratives" },
  { id: "evidence", label: "Evidence" },
];

export type PersonRole = "Creator" | "Founder" | "Player" | "Coach" | "Executive" | "Personality" | "Investor";
export type EventKind =
  | "Signing" | "Departure" | "Tournament" | "Championship" | "Controversy" | "CorporateChange" | "ProductLaunch";
export type MetricKind =
  | "Views" | "WatchTime" | "Engagement" | "Sentiment" | "Purchases" | "Revenue" | "ConversionRate" | "SubscriberChange"
  | "Valuation" | "Prize" | "Entries" | "Viewers" | "Followers";

export type RelationshipType =
  | "HAS_ASSIGNMENT" | "AT" | "HELD_ROLE" | "MEMBER_OF" | "PLAYS_FOR" | "COACHES" | "FOUNDED" | "OWNS"
  | "HOLDS_STAKE_IN" | "OPERATES" | "COMPETES_IN" | "CREATED" | "FEATURED_IN" | "COLLABORATED_WITH" | "PUBLISHED_ON"
  | "PART_OF_SERIES" | "PARTICIPATED_IN" | "SPONSORED_BY" | "PROMOTES" | "TARGETS" | "REACHED" | "WATCHED" | "PURCHASED"
  | "RESONATED_WITH" | "GENERATED" | "MEASURES" | "SUPPORTED_BY" | "PRECEDED" | "FOLLOWED_BY" | "AFFECTED"
  | "ASSOCIATED_WITH" | "COVERS" | "OF" | "STAKE_IN" | "SUCCEEDED_BY";
// NOTE: there is deliberately no CAUSED_BY. Use PRECEDED / FOLLOWED_BY / ASSOCIATED_WITH / AFFECTED unless a source
// states causation.

export type Status = "verified" | "reported" | "inferred" | "disputed" | "mock" | "simulated";
export type Origin = "observed" | "simulated";
export type DatePrecision = "day" | "month" | "year";

/** Valid time, transaction/observation time and provenance. All ISO-8601 UTC. `validTo: null` = still true. */
export interface TemporalProperties {
  validFrom: string | null;       // null = always existed (identity facts)
  validTo: string | null;
  observedAt: string;             // when this graph learned it (maps to lore.facts.known_from)
  sourceId: string;
  confidence: number;             // 0..1
  status: Status;
  datePrecision?: DatePrecision;  // "month" means the day was not published; validFrom is the first of the month
  note?: string;
}

export interface GraphNode {
  id: string;                     // stable internal ID, never the display name
  category: NodeCategory;
  subtype?: string;               // PersonRole | EventKind | MetricKind | ...
  name: string;                   // canonical display name
  aliases: string[];
  summary?: string;
  /** Hint shown when two entities could be confused (identity collision). */
  disambiguation?: string;
  importance?: number;            // 0..1 hand-set weight; the view blends it with degree
  attrs?: Record<string, string | number | boolean | null>;
  origin: Origin;
  temporal: TemporalProperties;   // existence interval of the node itself
  demo?: boolean;                 // created by the demo event stream
}

export interface GraphRelationship {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
  origin: Origin;
  temporal: TemporalProperties;
  claimId?: string;
  props?: Record<string, string | number | boolean | null>;
  demo?: boolean;
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  kind: "document" | "official" | "press" | "video" | "social" | "database" | "api" | "demo";
  url?: string;                   // only set when the URL is known; never invented
  publishedAt?: string;
}

export interface Claim {
  id: string;
  statement: string;
  sourceIds: string[];
  confidence: number;
  status: Status;
}

export interface MetricObservation {
  id: string;
  kind: MetricKind;
  label: string;
  subjectId: string;              // node the metric measures
  value: number;
  unit: string;                   // "views", "USD", "USD/year", "%"
  observedAt: string;
  sourceId: string;
  origin: Origin;
  status: Status;                 // "mock" for invented demo values, "simulated" for scenario output
  note?: string;
}

export interface GraphSnapshot {
  id: string;
  asOf: string;                   // the instant the snapshot answers for
  generatedAt: string;
  nodes: GraphNode[];             // observed only
  relationships: GraphRelationship[];
  metrics: MetricObservation[];
  claims: Claim[];
  sources: Source[];
  lastEventAt: string | null;
}

export interface SimulationScenario {
  scenarioId: string;
  title: string;
  graphSnapshotId: string;
  label: "SIMULATED";
  engine: string;                 // e.g. "MiroFish v0.1.2 (mock values)"
  generatedAt: string;
  assumptions: string[];
  /** Campaign scenarios carry outcome predictions. Backtest scenarios carry `backtest` instead. */
  predictedOutcomes?: {
    qualifiedViews: number;
    engagementLift: number;
    purchaseConversion: number;
    expectedRevenue: number;
    backlashProbability: number;
  };
  backtest?: BacktestForecast;
  affectedCohorts: { cohortId: string; liftEstimate: number }[];
  recommendedCreators: { personId: string; reason: string; fit: number }[];
  simulatedNodes: GraphNode[];
  simulatedEdges: GraphRelationship[];
  simulatedMetrics: MetricObservation[];
}

// ------------------------------------------------------------------------------------------------ backtests (design Ch. 18)

export type BacktestFamily = "recruitment" | "subathon" | "creator_event" | "drop";
export type BacktestSplit = "dev" | "holdout" | "prospective";

/** Where a T0 came from. The source rarely gives the exact day (A-20), so it says so. */
export type T0Status = "stated" | "derived" | "placeholder";

export interface BacktestOutcome {
  id: string;
  metric: string;
  label: string;
  value: number | null;           // null = the source gives no number (unscorable)
  bound: "exact" | "lower";       // "211,000+" is stored as 211000 with bound "lower"
  unit: string;
  sourceIds: string[];
  provenance: "organizer_reported" | "third_party";
  shock: boolean;                 // something nobody could know at T0 changed how the event ran
  scorable: boolean;
  metricNodeId: string | null;    // the MetricObservation node in the graph (visible only after the resolve date)
  archiveUrl: null;               // not in the source; left empty on purpose (A-20)
  capturedAt: null;
  note?: string;
}

export interface BacktestCase {
  id: string;
  title: string;
  family: BacktestFamily;
  split: BacktestSplit;
  t0: string | null;              // the exact instant, only when the source states it
  t0Cutoff: string;               // the date the dossier is cut at (equals t0 when stated)
  t0Status: T0Status;
  resolvesAt: string | null;
  subjectNodeId: string;          // the campaign or event node in the graph
  brief: { text: string | null; sourceIds: string[]; archiveUrl: null; note?: string };
  entities: string[];             // graph node ids the dossier focuses on
  knownAtT0: { key: string; label: string; value: boolean | string | number; sourceIds: string[] }[];
  questions: { metric: string; label: string; unit: string; window: string; shock: boolean }[];
  outcomes: BacktestOutcome[];
  baseline: { rule: string; b0: number | null; b0Label: string | null; b1: number | null; missing: string[] };
  masking: { terms: [string, string][] };   // free-text replacements for the brief (graph labels are masked separately)
  placeholders: string[];
  lockedForecastSha256: string | null;       // prospective cases only
}

export interface RankingPair {
  id: string;
  title: string;
  metric: string;
  earlierCaseId: string;
  laterCaseId: string;
  actualWinnerCaseId: string | null;   // null = not scorable yet
  baselineRule: "later edition wins";
  evidence: string;
  runnable: boolean;                   // both briefs are in the source, so both can run as variants A and B
}

export interface DossierOptions {
  asOf: string;                        // cut: nothing valid or observed after this instant is included
  title: string;
  focusIds?: string[];
  includeInferred?: boolean;           // analyst-inferred narratives and links. Off by default.
  includeAudienceSegments?: boolean;   // list cohorts by name only (no preferences), so the simulation has people to create. On by default.
  forbiddenTerms?: string[];           // strings that must not appear (outcome numbers and labels). Checked after building.
  mask?: { orgAlias: string; dateShiftDays: number; terms: [string, string][]; labelNodes: boolean } | null;
  briefs?: { label: string; text: string; sourceIds: string[] }[];
  knownAtT0?: { label: string; value: boolean | string | number }[];
  blindMetricIds?: string[];           // outcome metrics to withhold even if visible (pair runs are blind to both outcomes)
  maxChars?: number;
  placeholders?: string[];
}

export interface DossierManifest {
  asOf: string;
  snapshotId: string;
  chars: number;
  factCount: number;
  sections: Record<string, number>;
  withheld: { afterCutoff: number; inferred: number; mock: number; blinded: number };
  masked: boolean;
  placeholders: string[];
  leakCheck: { passed: boolean; hits: string[] };
}
export interface Dossier { text: string; manifest: DossierManifest }

export interface BacktestForecast {
  caseId: string;                      // case or ranking-pair id
  kind: "pair" | "case";
  question: string;
  options: { label: string; caseId: string }[];
  tally: Record<string, number>;       // option label -> agents choosing it
  undecided: number;
  agents: { agentId: number; name: string; choice: string | null; reason: string }[];
  predictedWinner: string | null;      // option label, null on a tie
  mirofish: { projectId: string | null; simulationId: string | null };
  modelNote: string;
}

export interface BacktestScore {
  pairId: string;
  scorable: boolean;
  actualWinner: string | null;
  predictedWinner: string | null;
  correct: boolean | null;
  baselineWinner: string | null;
  baselineCorrect: boolean | null;
  beatsBaseline: boolean | null;
  leaky: boolean;
  countsTowardGate: boolean;
  verdict: string;
}

/** Incremental update applied by the demo stream or a real feed. Observed graph only. */
export type GraphEventType =
  | "creator_signed" | "creator_departed" | "video_published" | "stream_live"
  | "campaign_launched" | "tournament_won" | "metric_updated";

export interface GraphEvent {
  id: string;
  type: GraphEventType;
  at: string;                     // event time
  demo: boolean;                  // true for generated demo events
  sourceId: string;
  payload: Record<string, unknown>;
}

export interface EventLogEntry { event: GraphEvent; appliedAt: string; summary: string; touched: string[] }

export interface SearchHit {
  node: GraphNode;
  matchedAlias: string | null;    // the alias that matched, if not the canonical name
  score: number;
}
export interface AliasResolution {
  query: string;
  candidates: GraphNode[];        // canonical nodes
  ambiguous: boolean;
}

/** Everything ever recorded about one node, regardless of the chosen date. Used for "current and historical roles". */
export interface NodeHistory {
  node: GraphNode;
  relationships: GraphRelationship[];   // all relationships touching the node, open or closed
  related: GraphNode[];                 // the nodes on the other end, plus role-assignment targets
  metrics: MetricObservation[];
}

/** What the UI consumes. Swap MockGraphDataProvider for a Postgres/Neo4j/API implementation without touching the UI. */
export interface GraphDataProvider {
  readonly name: string;
  getSnapshot(asOf: string | "current"): Promise<GraphSnapshot>;
  getNodeHistory(id: string): Promise<NodeHistory | null>;
  listBacktestCases(): Promise<BacktestCase[]>;
  getBacktestCase(id: string): Promise<BacktestCase | null>;
  listRankingPairs(): Promise<RankingPair[]>;
  /** Build a time-cut dossier from the observed graph. Never reads simulation data. */
  buildDossier(opts: DossierOptions): Promise<Dossier>;
  /** Store simulation results separately from observed facts. */
  saveSimulation(scenario: SimulationScenario): Promise<void>;
  search(query: string, limit?: number): Promise<SearchHit[]>;
  resolveAlias(query: string): Promise<AliasResolution>;
  applyEvent(event: GraphEvent): Promise<EventLogEntry>;
  getEventLog(): Promise<EventLogEntry[]>;
  listScenarios(): Promise<Pick<SimulationScenario, "scenarioId" | "title" | "label">[]>;
  loadSimulation(scenarioId: string): Promise<SimulationScenario>;
  subscribe(listener: (entry: EventLogEntry) => void): () => void;
}

export type ViewMode = "observed" | "simulation" | "compare";
