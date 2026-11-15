import type { GraphView, ViewLink } from "./view";

export interface PathResult {
  nodeIds: string[];
  links: { link: ViewLink; from: string; to: string }[];
  cost: number;
  containsInferred: boolean;
  containsSimulated: boolean;
}

/**
 * Shortest *meaningful* path (Dijkstra over an undirected view). Meaningful means: evidence nodes (sources, claims) and
 * measurement nodes are not used as shortcuts unless they are an endpoint, inferred links cost a little more than verified
 * ones, simulated links cost more, and very high-degree hubs are penalised so paths do not all collapse through "FaZe Clan".
 */
export function findPath(view: Pick<GraphView, "nodes" | "links">, fromId: string, toId: string): PathResult | null {
  if (fromId === toId) return { nodeIds: [fromId], links: [], cost: 0, containsInferred: false, containsSimulated: false };
  return search(view, fromId, (id) => id === toId);
}

/** Nearest node (by meaningful cost) that satisfies `accept`, e.g. the closest audience cohort or revenue metric. */
export function findNearest(view: Pick<GraphView, "nodes" | "links">, fromId: string, accept: (n: GraphView["nodes"][number]) => boolean): PathResult | null {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  return search(view, fromId, (id) => id !== fromId && !!byId.get(id) && accept(byId.get(id)!));
}

export const isAudience = (n: { category: string }) => n.category === "audience_cohort";
export const isRevenue = (n: { category: string; subtype?: string }) => n.category === "metric" && (n.subtype === "Revenue" || n.subtype === "Purchases" || n.subtype === "ConversionRate");

function search(view: Pick<GraphView, "nodes" | "links">, fromId: string, isTarget: (id: string) => boolean): PathResult | null {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  if (!byId.has(fromId)) return null;
  const adj = new Map<string, { link: ViewLink; other: string }[]>();
  for (const l of view.links) {
    const s = l.source as string, t = l.target as string;
    (adj.get(s) ?? adj.set(s, []).get(s)!).push({ link: l, other: t });
    (adj.get(t) ?? adj.set(t, []).get(t)!).push({ link: l, other: s });
  }
  const passable = (id: string) => {
    if (id === fromId || isTarget(id)) return true;
    const c = byId.get(id)!.category;
    return c !== "source" && c !== "claim" && c !== "metric";
  };
  const cost = (l: ViewLink, enteringId: string) => {
    let c = 1;
    if (l.dashed) c += 0.6;
    if (l.origin === "simulated") c += 1.5;
    if (l.type === "SUPPORTED_BY" || l.type === "MEASURES") c += 2;
    const n = byId.get(enteringId)!;
    if (!isTarget(enteringId) && n.degree > 16) c += Math.min(3, (n.degree - 16) * 0.15);
    return c;
  };
  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { id: string; link: ViewLink }>();
  const open = new Set([fromId]);
  const done = new Set<string>();
  let hit: string | null = null;
  while (open.size) {
    let u = "", best = Infinity;
    open.forEach((id) => { const d = dist.get(id)!; if (d < best) { best = d; u = id; } });
    open.delete(u);
    if (u !== fromId && isTarget(u)) { hit = u; break; }
    done.add(u);
    for (const { link, other } of adj.get(u) ?? []) {
      if (done.has(other) || !passable(other)) continue;
      const nd = best + cost(link, other);
      if (nd < (dist.get(other) ?? Infinity)) { dist.set(other, nd); prev.set(other, { id: u, link }); open.add(other); }
    }
  }
  if (hit === null) return null;
  const nodeIds = [hit], links: PathResult["links"] = [];
  for (let cur = hit; cur !== fromId;) {
    const p = prev.get(cur)!;
    links.unshift({ link: p.link, from: p.id, to: cur });
    nodeIds.unshift(p.id);
    cur = p.id;
  }
  return {
    nodeIds, links, cost: dist.get(hit)!,
    containsInferred: links.some((x) => x.link.status === "inferred" || x.link.status === "mock"),
    containsSimulated: links.some((x) => x.link.origin === "simulated"),
  };
}
