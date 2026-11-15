import type { GraphNode, GraphRelationship, MetricObservation, TemporalProperties } from "./types";

/** The demo's "Current" instant. A real provider would use Date.now(). */
export const DEMO_NOW = "2026-11-15T00:00:00Z";

export const ms = (iso: string): number => Date.parse(iso);

/** Half-open interval: validFrom <= t < validTo. A null bound is open. */
export function isValidAt(t: Pick<TemporalProperties, "validFrom" | "validTo">, asOf: string): boolean {
  const at = ms(asOf);
  if (t.validFrom !== null && ms(t.validFrom) > at) return false;
  if (t.validTo !== null && ms(t.validTo) <= at) return false;
  return true;
}

export const isCurrentAt = isValidAt;

/** Metrics are point observations: visible once observed. */
export const metricVisibleAt = (m: Pick<MetricObservation, "observedAt">, asOf: string): boolean => ms(m.observedAt) <= ms(asOf);

export function resolveAsOf(asOf: string | "current", now = DEMO_NOW): string {
  return asOf === "current" ? now : asOf;
}

export interface ValidView { nodes: GraphNode[]; relationships: GraphRelationship[] }

/** Nodes and relationships valid at `asOf`, with relationships dropped when an endpoint is not valid. */
export function filterValidAt(nodes: GraphNode[], rels: GraphRelationship[], asOf: string): ValidView {
  const vn = nodes.filter((n) => isValidAt(n.temporal, asOf));
  const ids = new Set(vn.map((n) => n.id));
  const vr = rels.filter((r) => isValidAt(r.temporal, asOf) && ids.has(r.from) && ids.has(r.to));
  return { nodes: vn, relationships: vr };
}

/** Close a relationship by setting validTo. Returns a new object; history is never mutated in place. */
export function closeRelationship(rel: GraphRelationship, at: string, note?: string): GraphRelationship {
  if (rel.temporal.validTo !== null && ms(rel.temporal.validTo) <= ms(at)) return rel;
  return { ...rel, temporal: { ...rel.temporal, validTo: at, note: note ?? rel.temporal.note } };
}

export const fmtDate = (iso: string | null, precision: TemporalProperties["datePrecision"] = "day"): string => {
  if (iso === null) return "open";
  const d = new Date(iso);
  if (precision === "year") return String(d.getUTCFullYear());
  const m = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return precision === "month" ? `${m} ${d.getUTCFullYear()}` : `${m} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
