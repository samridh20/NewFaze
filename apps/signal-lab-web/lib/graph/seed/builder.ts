import type {
  Claim, DatePrecision, GraphNode, GraphRelationship, MetricKind, MetricObservation, NodeCategory,
  RelationshipType, Source, Status,
} from "../types";

export const OBSERVED_AT = "2026-11-15T00:00:00Z";
const iso = (d: string | null): string | null => (d === null ? null : d.length === 4 ? `${d}-01-01T00:00:00Z` : d.length === 7 ? `${d}-01T00:00:00Z` : `${d}T00:00:00Z`);

export interface Opts {
  from?: string | null; to?: string | null; src: string; conf?: number; status?: Status; prec?: DatePrecision; note?: string;
}
export interface NodeOpts extends Opts {
  subtype?: string; aliases?: string[]; summary?: string; dis?: string; imp?: number; attrs?: GraphNode["attrs"];
}

/** Terse builder so seed data reads like the timeline it comes from. Dates: "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
export class SeedBuilder {
  nodes: GraphNode[] = [];
  rels: GraphRelationship[] = [];
  metrics: MetricObservation[] = [];
  claims: Claim[] = [];
  sources: Source[] = [];
  private seq = 0;

  private temporal(o: Opts) {
    const prec: DatePrecision | undefined = o.prec ?? (o.from && o.from.length === 4 ? "year" : o.from && o.from.length === 7 ? "month" : undefined);
    return {
      validFrom: iso(o.from ?? null), validTo: iso(o.to ?? null), observedAt: OBSERVED_AT, sourceId: o.src,
      confidence: o.conf ?? 0.95, status: o.status ?? "verified", ...(prec ? { datePrecision: prec } : {}),
      ...(o.note ? { note: o.note } : {}),
    };
  }

  node(id: string, category: NodeCategory, name: string, o: NodeOpts): string {
    if (this.nodes.some((n) => n.id === id)) throw new Error(`duplicate node ${id}`);
    this.nodes.push({
      id, category, name, subtype: o.subtype, aliases: o.aliases ?? [], summary: o.summary, disambiguation: o.dis,
      importance: o.imp, attrs: o.attrs, origin: "observed", temporal: this.temporal(o),
    });
    return id;
  }

  rel(type: RelationshipType, from: string, to: string, o: Opts & { claim?: string; props?: GraphRelationship["props"] }): string {
    const id = `r${++this.seq}:${type}:${from}>${to}`;
    this.rels.push({ id, type, from, to, origin: "observed", temporal: this.temporal(o), claimId: o.claim, props: o.props });
    return id;
  }

  /** Person -HAS_ASSIGNMENT-> RoleAssignment -AT-> Organization|Team. One intermediate node per assignment. */
  assign(person: string, role: string, at: string, o: Opts & { title?: string }): string {
    const id = `ra:${person.split(":")[1]}:${role.toLowerCase()}:${at.split(":")[1]}:${(o.from ?? "x").slice(0, 7)}`;
    this.node(id, "role_assignment", `${o.title ?? role} @ ${this.nodes.find((n) => n.id === at)?.name ?? at}`, {
      ...o, subtype: role, attrs: { role, title: o.title ?? role },
    });
    this.rel("HAS_ASSIGNMENT", person, id, o);
    this.rel("AT", id, at, o);
    return id;
  }

  /** Holder -HOLDS_STAKE_IN-> OwnershipStake -OF-> Target. Percent is null when unpublished. */
  stake(holder: string, target: string, pct: number | null, o: Opts & { tag?: string }): string {
    const id = `st:${holder.split(":")[1]}:${target.split(":")[1]}:${o.tag ?? (o.from ?? "x").slice(0, 7)}`;
    const hn = this.nodes.find((n) => n.id === holder)?.name ?? holder;
    const tn = this.nodes.find((n) => n.id === target)?.name ?? target;
    this.node(id, "ownership_stake", pct === null ? `${hn} in ${tn}` : `${hn}: ${pct}% of ${tn}`, {
      ...o, subtype: "OwnershipStake", attrs: { percent: pct },
    });
    this.rel("HOLDS_STAKE_IN", holder, id, o);
    this.rel("OF", id, target, o);
    return id;
  }

  metric(id: string, kind: MetricKind, label: string, subjectId: string, value: number, unit: string, observedAt: string,
    src: string, status: Status = "reported", note?: string): void {
    this.metrics.push({ id, kind, label, subjectId, value, unit, observedAt: iso(observedAt)!, sourceId: src, origin: "observed", status, note });
  }

  claim(id: string, statement: string, sourceIds: string[], confidence: number, status: Status): string {
    this.claims.push({ id, statement, sourceIds, confidence, status });
    return id;
  }
}
