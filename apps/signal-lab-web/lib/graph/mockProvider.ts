import { DEMO_NOW, closeRelationship, filterValidAt, metricVisibleAt, ms, resolveAsOf } from "./temporal";
import { buildObservedSeed, type ObservedSeed } from "./seed";
import { BACKTEST_CASES, RANKING_PAIRS } from "./seed/backtests";
import { buildDossierFrom } from "./dossier";
import { SNAPSHOT_ID, buildScenario } from "./seed/simulation";
import { resolveAlias as resolveAliasIn, search as searchIn } from "./search";
import type {
  AliasResolution, EventLogEntry, GraphDataProvider, GraphEvent, GraphNode, GraphRelationship, GraphSnapshot,
  BacktestCase, Dossier, DossierOptions, MetricObservation, NodeHistory, RankingPair, SearchHit, SimulationScenario,
} from "./types";

export class SimulatedDataRejected extends Error {}

/**
 * In-memory provider for the demo.
 *
 * Observed and simulated data live in separate stores. applyEvent() can only write to the observed store and refuses any
 * record marked simulated, so a prediction can never be stored as a fact.
 *
 * Neo4jGraphDataProvider extension points (same interface, nothing in the UI changes):
 *   getSnapshot -> MATCH ... WHERE r.validFrom <= $asOf AND (r.validTo IS NULL OR r.validTo > $asOf)
 *   applyEvent  -> a consumer of the Kafka/SSE feed that MERGEs nodes and sets validTo on ended relationships
 *   loadSimulation -> read from the Signal Lab API (/v1/mirofish/*) into a SimulationScenario, never into the fact store
 * A Postgres-backed provider can map onto lore.entities / lore.aliases / lore.facts (valid, known_from, confidence, source_url).
 */
export class MockGraphDataProvider implements GraphDataProvider {
  readonly name = "mock (in-memory seed from the FaZe timeline)";
  private nodes: GraphNode[];
  private rels: GraphRelationship[];
  private metrics: MetricObservation[];
  private seed: ObservedSeed;
  private log: EventLogEntry[] = [];
  private listeners = new Set<(e: EventLogEntry) => void>();
  private scenarios = new Map<string, SimulationScenario>();
  /** "Current" follows the newest applied event, so demo events appear without moving the date control. */
  private clock: string;

  constructor(private readonly now: string = DEMO_NOW) {
    this.clock = now;
    this.seed = buildObservedSeed();
    this.nodes = [...this.seed.nodes];
    this.rels = [...this.seed.relationships];
    this.metrics = [...this.seed.metrics];
    const sc = buildScenario();
    this.scenarios.set(sc.scenarioId, sc);
  }

  async getSnapshot(asOf: string | "current"): Promise<GraphSnapshot> {
    const at = resolveAsOf(asOf, this.clock);
    const { nodes, relationships } = filterValidAt(this.nodes, this.rels, at);
    const ids = new Set(nodes.map((n) => n.id));
    return {
      id: `snapshot-${at.slice(0, 10)}`, asOf: at, generatedAt: this.clock,
      nodes, relationships,
      metrics: this.metrics.filter((m) => metricVisibleAt(m, at) && ids.has(m.id)),
      claims: this.seed.claims, sources: this.seed.sources,
      lastEventAt: this.log.length ? this.log[this.log.length - 1].event.at : null,
    };
  }

  async search(query: string, limit = 12): Promise<SearchHit[]> { return searchIn(this.nodes, query, limit); }
  async resolveAlias(query: string): Promise<AliasResolution> { return resolveAliasIn(this.nodes, query); }
  get currentTime(): string { return this.clock; }

  async listBacktestCases(): Promise<BacktestCase[]> { return BACKTEST_CASES; }
  async getBacktestCase(id: string): Promise<BacktestCase | null> { return BACKTEST_CASES.find((c) => c.id === id) ?? null; }
  async listRankingPairs(): Promise<RankingPair[]> { return RANKING_PAIRS; }

  /** Reads only the observed store. Simulation scenarios are never an input, so a prediction cannot leak into a dossier. */
  async buildDossier(opts: DossierOptions): Promise<Dossier> {
    return buildDossierFrom({ nodes: this.nodes, rels: this.rels, metrics: this.metrics, sources: this.seed.sources }, opts);
  }

  /** Simulation results are stored beside, never inside, the observed graph. */
  async saveSimulation(scenario: SimulationScenario): Promise<void> {
    const bad = [...scenario.simulatedNodes, ...scenario.simulatedEdges].filter((x) => x.origin !== "simulated" || x.temporal.status !== "simulated");
    if (bad.length) throw new SimulatedDataRejected("a saved scenario may only contain simulated records");
    if (scenario.simulatedNodes.some((n) => this.nodes.some((o) => o.id === n.id))) throw new SimulatedDataRejected("a simulated node id collides with an observed node");
    this.scenarios.set(scenario.scenarioId, scenario);
  }

  async getNodeHistory(id: string): Promise<NodeHistory | null> {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return null;
    const rels = this.rels.filter((r) => r.from === id || r.to === id);
    const related = new Set<string>();
    rels.forEach((r) => { related.add(r.from === id ? r.to : r.from); });
    // role assignments and stakes are intermediate: pull in the organization or team at the other end
    for (const rid of [...related]) {
      const n = this.nodes.find((x) => x.id === rid);
      if (n && (n.category === "role_assignment" || n.category === "ownership_stake" || n.category === "campaign_participation"))
        this.rels.filter((r) => r.from === rid || r.to === rid).forEach((r) => { rels.push(r); related.add(r.from); related.add(r.to); });
    }
    related.delete(id);
    return {
      node, relationships: [...new Map(rels.map((r) => [r.id, r])).values()],
      related: this.nodes.filter((n) => related.has(n.id)),
      metrics: this.metrics.filter((m) => m.subjectId === id),
    };
  }

  async getEventLog(): Promise<EventLogEntry[]> { return [...this.log]; }
  subscribe(l: (e: EventLogEntry) => void): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }

  async listScenarios() { return [...this.scenarios.values()].map(({ scenarioId, title, label }) => ({ scenarioId, title, label })); }
  async loadSimulation(id: string): Promise<SimulationScenario> {
    const s = this.scenarios.get(id);
    if (!s) throw new Error(`unknown scenario ${id}`);
    return s;
  }
  get snapshotId() { return SNAPSHOT_ID; }

  /** Apply an incremental update. History is preserved: ended things get validTo, nothing is deleted. */
  async applyEvent(event: GraphEvent): Promise<EventLogEntry> {
    const touched: string[] = [];
    const p = event.payload as Record<string, any>;
    if (p.origin === "simulated" || p.status === "simulated") throw new SimulatedDataRejected("simulated data cannot be written to the observed graph");
    const status = event.demo ? ("mock" as const) : ("reported" as const);
    const T = (from: string | null = event.at) => ({ validFrom: from, validTo: null, observedAt: event.at, sourceId: event.sourceId, confidence: event.demo ? 0.2 : 0.8, status });
    const addNode = (n: Omit<GraphNode, "origin" | "temporal" | "aliases"> & { aliases?: string[] }) => {
      if (this.nodes.some((x) => x.id === n.id)) return;
      this.nodes.push({ aliases: [], ...n, origin: "observed", temporal: T(), demo: event.demo });
      touched.push(n.id);
    };
    const addRel = (type: GraphRelationship["type"], from: string, to: string) => {
      this.rels.push({ id: `ev:${event.id}:${type}:${from}>${to}`, type, from, to, origin: "observed", temporal: T(), demo: event.demo });
      touched.push(`${from}>${to}`);
    };
    let summary = "";
    switch (event.type) {
      case "creator_signed": {
        addNode({ id: p.personId, category: "person", subtype: "Person", name: p.name, importance: 0.4 });
        const ra = `ra:${p.personId.split(":")[1]}:${event.id}`;
        addNode({ id: ra, category: "role_assignment", subtype: p.role ?? "Creator", name: `${p.role ?? "Creator"} @ ${p.orgName ?? p.orgId}`, attrs: { role: p.role ?? "Creator" } });
        addRel("HAS_ASSIGNMENT", p.personId, ra); addRel("AT", ra, p.orgId);
        summary = `${p.name} signed with ${p.orgName ?? p.orgId}`; break;
      }
      case "creator_departed": {
        for (const r of this.rels.filter((x) => x.type === "HAS_ASSIGNMENT" && x.from === p.personId && x.temporal.validTo === null)) {
          const ra = r.to;
          this.replaceRel(r, closeRelationship(r, event.at, "Departure (demo event)")); touched.push(r.id);
          for (const at of this.rels.filter((x) => x.type === "AT" && x.from === ra && x.temporal.validTo === null)) this.replaceRel(at, closeRelationship(at, event.at));
          const i = this.nodes.findIndex((n) => n.id === ra);
          if (i >= 0) this.nodes[i] = { ...this.nodes[i], temporal: { ...this.nodes[i].temporal, validTo: event.at } };
        }
        summary = `${p.name ?? p.personId} departed`; break;
      }
      case "video_published": case "stream_live": {
        addNode({ id: p.id, category: "content_asset", subtype: event.type === "stream_live" ? "Stream" : "Video", name: p.name, importance: 0.45 });
        if (p.creatorId) addRel("CREATED", p.creatorId, p.id);
        if (p.channelId) addRel("PUBLISHED_ON", p.id, p.channelId);
        if (typeof p.views === "number") this.recordMetric(event, `m:${p.id}`, "Views", `${p.name}: ${event.type === "stream_live" ? "concurrent viewers" : "views"}`, p.id, p.views, event.type === "stream_live" ? "concurrent viewers" : "views", touched);
        summary = event.type === "stream_live" ? `${p.name} went live` : `${p.name} published`; break;
      }
      case "campaign_launched": {
        addNode({ id: p.id, category: "campaign", subtype: "ContentCampaign", name: p.name, importance: 0.5 });
        if (p.brandId) addRel("SPONSORED_BY", p.id, p.brandId);
        if (p.orgId) addRel("PARTICIPATED_IN", p.orgId, p.id);
        summary = `${p.name} launched`; break;
      }
      case "tournament_won": {
        addNode({ id: p.id, category: "event", subtype: "Championship", name: p.name, importance: 0.6 });
        if (p.teamId) addRel("PARTICIPATED_IN", p.teamId, p.id);
        if (typeof p.prize === "number") this.recordMetric(event, `m:${p.id}:prize`, "Prize", `${p.name}: prize`, p.id, p.prize, "USD", touched);
        summary = `${p.name} won`; break;
      }
      case "metric_updated": {
        // a new observation, not an overwrite: the previous value stays in history
        this.recordMetric(event, `m:${p.subjectId}:${event.id}`, p.kind ?? "Views", p.label, p.subjectId, p.value, p.unit ?? "views", touched);
        summary = `${p.label} updated to ${Number(p.value).toLocaleString("en")}`; break;
      }
    }
    const entry: EventLogEntry = { event, appliedAt: event.at, summary: `${event.demo ? "[demo] " : ""}${summary}`, touched };
    if (ms(event.at) > ms(this.clock)) this.clock = event.at;
    this.log.push(entry);
    this.listeners.forEach((l) => l(entry));
    return entry;
  }

  private replaceRel(old: GraphRelationship, next: GraphRelationship) {
    const i = this.rels.findIndex((r) => r.id === old.id);
    if (i >= 0) this.rels[i] = next;
  }

  private recordMetric(event: GraphEvent, id: string, kind: MetricObservation["kind"], label: string, subjectId: string, value: number, unit: string, touched: string[]) {
    const m: MetricObservation = { id, kind, label, subjectId, value, unit, observedAt: event.at, sourceId: event.sourceId, origin: "observed", status: event.demo ? "mock" : "reported", note: event.demo ? "Generated by the demo stream." : undefined };
    this.metrics.push(m);
    const t = { validFrom: event.at, validTo: null, observedAt: event.at, sourceId: event.sourceId, confidence: event.demo ? 0.2 : 0.8, status: m.status };
    this.nodes.push({ id, category: "metric", subtype: kind, name: label, aliases: [], origin: "observed", attrs: { value, unit }, temporal: t, demo: event.demo });
    this.rels.push({ id: `ev:${event.id}:MEASURES:${id}`, type: "MEASURES", from: id, to: subjectId, origin: "observed", temporal: t, demo: event.demo });
    touched.push(id);
  }
}
