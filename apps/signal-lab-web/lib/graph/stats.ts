import type { GraphView } from "./view";

export interface NodeStats {
  degree: number;
  betweenness: number;           // 0..1, normalised by the maximum in this view
  bridgeLabel: "bridge" | "connector" | "peripheral";
  cohorts: { id: string; name: string; hops: number }[];
  revenuePaths: { id: string; name: string; hops: number; status: string }[];
  dependency: { lost: number; total: number; score: number; label: "low" | "moderate" | "high" | "n/a"; lostNames: string[] };
}

const isTarget = (c: string, st?: string) => c === "audience_cohort" || (c === "metric" && (st === "Revenue" || st === "Purchases" || st === "ConversionRate"));

function adjacency(view: Pick<GraphView, "nodes" | "links">, skip: (cat: string) => boolean) {
  const keep = new Set(view.nodes.filter((n) => !skip(n.category)).map((n) => n.id));
  const adj = new Map<string, string[]>();
  keep.forEach((id) => adj.set(id, []));
  for (const l of view.links) {
    const s = l.source as string, t = l.target as string;
    if (keep.has(s) && keep.has(t)) { adj.get(s)!.push(t); adj.get(t)!.push(s); }
  }
  return adj;
}

/** Brandes betweenness on the undirected view, evidence nodes excluded. Fine for a few hundred nodes. */
export function betweenness(view: Pick<GraphView, "nodes" | "links">): Map<string, number> {
  const adj = adjacency(view, (c) => c === "source" || c === "claim");
  const bc = new Map<string, number>([...adj.keys()].map((k) => [k, 0]));
  for (const s of adj.keys()) {
    const stack: string[] = [], pred = new Map<string, string[]>(), sigma = new Map<string, number>(), dist = new Map<string, number>();
    adj.forEach((_, v) => { pred.set(v, []); sigma.set(v, 0); dist.set(v, -1); });
    sigma.set(s, 1); dist.set(s, 0);
    const q = [s];
    for (let qi = 0; qi < q.length; qi++) {
      const v = q[qi]; stack.push(v);
      for (const w of adj.get(v)!) {
        if (dist.get(w)! < 0) { dist.set(w, dist.get(v)! + 1); q.push(w); }
        if (dist.get(w) === dist.get(v)! + 1) { sigma.set(w, sigma.get(w)! + sigma.get(v)!); pred.get(w)!.push(v); }
      }
    }
    const delta = new Map<string, number>([...adj.keys()].map((k) => [k, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      if (w !== s) bc.set(w, bc.get(w)! + delta.get(w)!);
    }
  }
  bc.forEach((v, k) => bc.set(k, v / 2));
  return bc;
}

function bfs(adj: Map<string, string[]>, from: string, maxDepth: number, blocked?: string): Map<string, number> {
  const d = new Map<string, number>([[from, 0]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const v = q[i];
    if (d.get(v)! >= maxDepth) continue;
    for (const w of adj.get(v) ?? []) if (w !== blocked && !d.has(w)) { d.set(w, d.get(v)! + 1); q.push(w); }
  }
  return d;
}

export function nodeStats(view: Pick<GraphView, "nodes" | "links">, id: string, bc: Map<string, number> = betweenness(view)): NodeStats {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const adj = adjacency(view, (c) => c === "source" || c === "claim");
  const max = Math.max(1e-9, ...bc.values());
  const b = (bc.get(id) ?? 0) / max;
  const reach = bfs(adj, id, 4);
  const cohorts = [...reach].filter(([k, h]) => h > 0 && h <= 3 && byId.get(k)?.category === "audience_cohort").map(([k, h]) => ({ id: k, name: byId.get(k)!.name, hops: h })).sort((a, c) => a.hops - c.hops);
  const revenuePaths = [...reach].filter(([k, h]) => h > 0 && byId.get(k)?.category === "metric" && ["Revenue", "Purchases", "ConversionRate"].includes(byId.get(k)!.subtype ?? ""))
    .map(([k, h]) => ({ id: k, name: byId.get(k)!.name, hops: h, status: byId.get(k)!.temporal.status })).sort((a, c) => a.hops - c.hops);

  // dependency risk: how many cohorts / revenue measurements lose their connection to the core if this node disappears
  const core = [...adj.keys()].includes("org:faze-clan") ? "org:faze-clan" : [...adj.entries()].sort((a, c) => c[1].length - a[1].length)[0]?.[0];
  const targets = view.nodes.filter((n) => n.id !== id && isTarget(n.category, n.subtype) && adj.has(n.id));
  let lost: string[] = [];
  if (core && core !== id && adj.has(core)) {
    const still = bfs(adj, core, 999, id);
    lost = targets.filter((t) => !still.has(t.id) && bfs(adj, core, 999).has(t.id)).map((t) => t.name);
  }
  const score = targets.length ? lost.length / targets.length : 0;
  const label = core === id ? "n/a" : score >= 0.15 ? "high" : score >= 0.04 ? "moderate" : "low";
  return {
    degree: view.links.filter((l) => l.source === id || l.target === id).length,
    betweenness: b,
    bridgeLabel: b >= 0.5 ? "bridge" : b >= 0.1 ? "connector" : "peripheral",
    cohorts, revenuePaths,
    dependency: { lost: lost.length, total: targets.length, score, label, lostNames: lost.slice(0, 6) },
  };
}
