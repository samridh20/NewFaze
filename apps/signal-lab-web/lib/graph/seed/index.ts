import type { Claim, GraphNode, GraphRelationship, MetricObservation, Source } from "../types";
import { OBSERVED_AT, SeedBuilder } from "./builder";
import { SOURCES } from "./sources";
import { seedTalentAndOrgs } from "./talent-orgs";
import { seedEventsContentCommerce } from "./events-content";
import { seedAudiencesAndNarratives } from "./audiences";
import { seedBacktestEntities } from "./backtests";

export interface ObservedSeed { nodes: GraphNode[]; relationships: GraphRelationship[]; metrics: MetricObservation[]; claims: Claim[]; sources: Source[] }

export function buildObservedSeed(): ObservedSeed {
  const b = new SeedBuilder();
  seedTalentAndOrgs(b);
  seedEventsContentCommerce(b);
  seedBacktestEntities(b);
  seedAudiencesAndNarratives(b);
  const nodes = [...b.nodes];
  const rels = [...b.rels];
  const known = new Set(nodes.map((n) => n.id));
  // evidence: every source is a node; claims and metrics point at their sources
  for (const s of SOURCES)
    nodes.push({ id: `src:${s.id}`, category: "source", name: s.publisher, aliases: [], summary: s.title, origin: "observed", attrs: { url: s.url ?? null, kind: s.kind }, temporal: { validFrom: null, validTo: null, observedAt: OBSERVED_AT, sourceId: s.id, confidence: 1, status: s.kind === "demo" ? "mock" : "verified" } });
  b.claims.forEach((c, i) => {
    nodes.push({ id: c.id, category: "claim", name: c.statement.length > 64 ? `${c.statement.slice(0, 61)}…` : c.statement, summary: c.statement, aliases: [], origin: "observed", temporal: { validFrom: null, validTo: null, observedAt: OBSERVED_AT, sourceId: c.sourceIds[0], confidence: c.confidence, status: c.status } });
    c.sourceIds.forEach((sid, j) => rels.push({ id: `rc${i}-${j}:SUPPORTED_BY`, type: "SUPPORTED_BY", from: c.id, to: `src:${sid}`, origin: "observed", temporal: { validFrom: null, validTo: null, observedAt: OBSERVED_AT, sourceId: sid, confidence: c.confidence, status: c.status } }));
  });
  b.metrics.forEach((m, i) => {
    nodes.push({ id: m.id, category: "metric", subtype: m.kind, name: m.label, aliases: [], origin: "observed", attrs: { value: m.value, unit: m.unit }, summary: m.note,
      temporal: { validFrom: m.observedAt, validTo: null, observedAt: OBSERVED_AT, sourceId: m.sourceId, confidence: m.status === "mock" ? 0.1 : m.status === "disputed" ? 0.4 : 0.9, status: m.status } });
    const subj = nodes.find((n) => n.id === m.subjectId);
    const t = { validFrom: m.observedAt, validTo: null, observedAt: OBSERVED_AT, sourceId: m.sourceId, confidence: m.status === "mock" ? 0.1 : 0.9, status: m.status };
    if (m.kind === "Revenue" && subj?.category === "campaign") rels.push({ id: `rm${i}:GENERATED`, type: "GENERATED", from: m.subjectId, to: m.id, origin: "observed", temporal: t });
    else rels.push({ id: `rm${i}:MEASURES`, type: "MEASURES", from: m.id, to: m.subjectId, origin: "observed", temporal: t });
    rels.push({ id: `rm${i}:SUPPORTED_BY`, type: "SUPPORTED_BY", from: m.id, to: `src:${m.sourceId}`, origin: "observed", temporal: { ...t, validFrom: null } });
  });
  // consistency guard: a seed bug should fail loudly in tests, not draw a broken graph
  const ids = new Set(nodes.map((n) => n.id));
  for (const r of rels) if (!ids.has(r.from) || !ids.has(r.to)) throw new Error(`dangling relationship ${r.id}`);
  void known;
  return { nodes, relationships: rels, metrics: b.metrics, claims: b.claims, sources: SOURCES };
}
