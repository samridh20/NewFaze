import type { AliasResolution, GraphNode, SearchHit } from "./types";

/** Lowercase, strip diacritics, collapse punctuation: "Håvard “rain”" -> "havard rain". */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[“”"'`’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const SEARCHABLE = new Set(["person", "organization", "team", "game", "channel", "content_asset", "content_series", "event", "campaign", "brand", "product", "audience_cohort", "narrative"]);

export function search(nodes: GraphNode[], query: string, limit = 12): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const node of nodes) {
    if (!SEARCHABLE.has(node.category)) continue;
    let best = 0, matched: string | null = null;
    for (const label of [node.name, ...node.aliases]) {
      const l = norm(label);
      const score = l === q ? 100 : l.startsWith(q) ? 80 : l.split(" ").some((w) => w.startsWith(q)) ? 60 : l.includes(q) ? 40 : 0;
      if (score > best) { best = score; matched = label === node.name ? null : label; }
    }
    if (best > 0) hits.push({ node, matchedAlias: matched, score: best + (node.category === "person" ? 3 : 0) + (node.importance ?? 0) });
  }
  return hits.sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name)).slice(0, limit);
}

/** An alias resolves to the canonical node. When several canonical nodes share the alias, say so instead of guessing. */
export function resolveAlias(nodes: GraphNode[], query: string): AliasResolution {
  const q = norm(query);
  const exact = nodes.filter((n) => SEARCHABLE.has(n.category) && [n.name, ...n.aliases].some((l) => norm(l) === q));
  const candidates = [...new Map(exact.map((n) => [n.id, n])).values()];
  return { query, candidates, ambiguous: candidates.length > 1 };
}
