import type { GraphNode, GraphRelationship, GraphSnapshot, Layer, SimulationScenario, ViewMode } from "./types";

export function layerOf(n: Pick<GraphNode, "category" | "subtype">): Layer {
  switch (n.category) {
    case "person": case "role_assignment": return "talent";
    case "organization": case "ownership_stake": return "organizations";
    case "team": case "game": return "esports";
    case "event":
      if (n.subtype === "Tournament" || n.subtype === "Championship") return "esports";
      if (n.subtype === "Signing" || n.subtype === "Departure") return "talent";
      if (n.subtype === "CorporateChange") return "organizations";
      if (n.subtype === "Controversy") return "audiences";
      return "commerce";
    case "channel": case "content_asset": case "content_series": return "content";
    case "campaign": case "campaign_participation": case "brand": case "product": return "commerce";
    case "metric":
      if (n.subtype === "Revenue" || n.subtype === "Purchases" || n.subtype === "ConversionRate" || n.subtype === "Valuation" || n.subtype === "Prize") return "commerce";
      if (n.subtype === "Sentiment" || n.subtype === "Entries" || n.subtype === "Followers") return "audiences";
      return "content";
    case "audience_cohort": case "narrative": return "audiences";
    case "source": case "claim": return "evidence";
  }
}

export const LAYER_COLORS: Record<Layer, string> = {
  talent: "#ff3b5c", organizations: "#60a5fa", esports: "#34d399", content: "#f59e0b",
  commerce: "#a78bfa", audiences: "#22d3ee", evidence: "#94a3b8",
};
export const CATEGORY_LABEL: Record<string, string> = {
  person: "Person", organization: "Organization", team: "Team", game: "Game", channel: "Channel", content_asset: "Content",
  content_series: "Series", event: "Event", campaign: "Campaign", brand: "Brand", product: "Product", audience_cohort: "Audience cohort",
  narrative: "Narrative", metric: "Metric", source: "Source", claim: "Claim", role_assignment: "Role assignment",
  ownership_stake: "Ownership stake", campaign_participation: "Campaign participation",
};

export interface ViewNode extends GraphNode { layer: Layer; degree: number; size: number; context: boolean }
export interface ViewLink {
  id: string; source: string; target: string; type: GraphRelationship["type"]; origin: GraphRelationship["origin"];
  dashed: boolean; status: GraphRelationship["temporal"]["status"]; confidence: number; rel: GraphRelationship; curvature: number;
}
export interface GraphView { nodes: ViewNode[]; links: ViewLink[]; simulationShown: boolean; simulationNote: string | null }

const DASHED = new Set(["inferred", "mock", "simulated", "disputed"]);

export interface ComposeInput {
  snapshot: GraphSnapshot;
  scenario: SimulationScenario | null;
  mode: ViewMode;
  layers: ReadonlySet<Layer>;
}

/**
 * Build what the canvas draws. The observed snapshot is never mutated or merged: simulated records are appended to the
 * view only, flagged origin "simulated", and only when the scenario's snapshot is not in the future of the chosen date.
 */
export function composeView({ snapshot, scenario, mode, layers }: ComposeInput): GraphView {
  const wantsSim = mode !== "observed" && scenario !== null;
  const simAllowed = wantsSim && snapshot.asOf >= scenario!.generatedAt.slice(0, 10);
  const simNodes = simAllowed ? scenario!.simulatedNodes : [];
  const simEdges = simAllowed ? scenario!.simulatedEdges : [];
  const note = wantsSim && !simAllowed ? `The scenario starts from ${scenario!.graphSnapshotId}. Move the date to Current to see it.` : null;

  let nodes: GraphNode[] = [...snapshot.nodes, ...simNodes];
  let rels: GraphRelationship[] = [...snapshot.relationships, ...simEdges];
  const context = new Set<string>();
  if (mode === "simulation" && simAllowed) {
    // Simulation mode: the scenario plus only the observed nodes it touches, so predicted links are not drowned out.
    const touched = new Set<string>();
    simEdges.forEach((e) => { touched.add(e.from); touched.add(e.to); });
    simNodes.forEach((n) => touched.add(n.id));
    nodes = nodes.filter((n) => touched.has(n.id));
    nodes.forEach((n) => { if (n.origin === "observed") context.add(n.id); });
    rels = rels.filter((r) => touched.has(r.from) && touched.has(r.to) && r.origin === "simulated");
  } else if (mode === "simulation") {
    nodes = []; rels = [];
  }

  nodes = nodes.filter((n) => layers.has(layerOf(n)));
  const ids = new Set(nodes.map((n) => n.id));
  rels = rels.filter((r) => ids.has(r.from) && ids.has(r.to));
  const degree = new Map<string, number>();
  rels.forEach((r) => { degree.set(r.from, (degree.get(r.from) ?? 0) + 1); degree.set(r.to, (degree.get(r.to) ?? 0) + 1); });

  // parallel edges between the same pair get different curvature so they stay readable
  const groups = new Map<string, number[]>();
  rels.forEach((r, i) => { const k = [r.from, r.to].sort().join("|"); (groups.get(k) ?? groups.set(k, []).get(k)!).push(i); });
  const curv: number[] = [];
  groups.forEach((idx) => idx.forEach((i, j) => { curv[i] = idx.length === 1 ? 0 : (j - (idx.length - 1) / 2) * 0.3; }));

  return {
    nodes: nodes.map((n) => {
      const d = degree.get(n.id) ?? 0;
      return { ...n, layer: layerOf(n), degree: d, size: 3 + (n.importance ?? 0.3) * 5 + Math.sqrt(d) * 0.9, context: context.has(n.id) };
    }),
    links: rels.map((r, i) => ({
      id: r.id, source: r.from, target: r.to, type: r.type, origin: r.origin, status: r.temporal.status, confidence: r.temporal.confidence,
      dashed: r.origin === "simulated" || DASHED.has(r.temporal.status), rel: r, curvature: curv[i] ?? 0,
    })),
    simulationShown: simAllowed,
    simulationNote: note,
  };
}

/** Ids within `depth` hops of `id` (undirected), including `id`. */
export function neighborhood(view: Pick<GraphView, "links">, id: string, depth: 1 | 2): Set<string> {
  const adj = new Map<string, string[]>();
  view.links.forEach((l) => {
    (adj.get(l.source as string) ?? adj.set(l.source as string, []).get(l.source as string)!).push(l.target as string);
    (adj.get(l.target as string) ?? adj.set(l.target as string, []).get(l.target as string)!).push(l.source as string);
  });
  let frontier = new Set([id]);
  const seen = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    frontier.forEach((n) => (adj.get(n) ?? []).forEach((m) => { if (!seen.has(m)) { seen.add(m); next.add(m); } }));
    frontier = next;
  }
  return seen;
}
