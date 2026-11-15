import type { GraphNode, GraphRelationship, MetricObservation, SimulationScenario } from "../types";
import { DEMO_NOW } from "../temporal";

/**
 * A MiroFish-style scenario with MOCK values. Every record here has origin "simulated" and status "simulated".
 * Nothing in this file is ever added to the observed store.
 */
export const SNAPSHOT_ID = `snapshot-${DEMO_NOW.slice(0, 10)}`;

const T = (note?: string) => ({ validFrom: null, validTo: null, observedAt: DEMO_NOW, sourceId: "sim-mirofish-mock", confidence: 0.4, status: "simulated" as const, note });

const node = (id: string, category: GraphNode["category"], name: string, extra: Partial<GraphNode> = {}): GraphNode =>
  ({ id, category, name, aliases: [], origin: "simulated", temporal: T(), ...extra });
let n = 0;
const edge = (type: GraphRelationship["type"], from: string, to: string, props?: GraphRelationship["props"]): GraphRelationship =>
  ({ id: `sim:r${++n}:${type}`, type, from, to, origin: "simulated", temporal: T(), props });
const metric = (id: string, kind: MetricObservation["kind"], label: string, value: number, unit: string): MetricObservation =>
  ({ id, kind, label, subjectId: "sim:camp:trickshot-reunion", value, unit, observedAt: DEMO_NOW, sourceId: "sim-mirofish-mock", origin: "simulated", status: "simulated", note: "Predicted, not measured." });

export function buildScenario(): SimulationScenario {
  const camp = "sim:camp:trickshot-reunion";
  const metrics = [
    metric("sim:m:views", "Views", "Predicted qualified views", 2_500_000, "views"),
    metric("sim:m:revenue", "Revenue", "Predicted revenue", 180_000, "USD"),
    metric("sim:m:conv", "ConversionRate", "Predicted purchase conversion", 0.031, "ratio"),
    metric("sim:m:lift", "Engagement", "Predicted engagement lift", 0.18, "ratio"),
    metric("sim:m:backlash", "Sentiment", "Predicted backlash probability", 0.12, "probability"),
  ];
  const nodes: GraphNode[] = [
    node(camp, "campaign", "SIM: ILLCAMS 51, Trickshot Reunion Drop", { subtype: "ContentCampaign", importance: 0.9, summary: "Proposed campaign. A scrim's prediction, not an event." }),
    ...metrics.map((m) => node(m.id, "metric", m.label, { subtype: m.kind, attrs: { value: m.value, unit: m.unit }, summary: "Simulated output." })),
  ];
  const edges: GraphRelationship[] = [
    edge("PARTICIPATED_IN", "person:temperrr", camp), edge("PARTICIPATED_IN", "person:kaysan", camp), edge("PARTICIPATED_IN", "person:gursh", camp),
    edge("SPONSORED_BY", camp, "brand:gfuel"), edge("PART_OF_SERIES", camp, "series:illcams"), edge("PROMOTES", camp, "series:nostalgia"),
    edge("PUBLISHED_ON", camp, "ch:yt-faze"), edge("FOLLOWED_BY", "c:mw2-10k", camp, { precedent: "4.43M-view trickshot challenge, Mar 2026" }),
    edge("TARGETS", camp, "cohort:og-trickshot"), edge("TARGETS", camp, "cohort:cod-sniping"), edge("TARGETS", camp, "cohort:dormant-returning"), edge("TARGETS", camp, "cohort:merch-buyers"),
    edge("AFFECTED", camp, "narr:nostalgia"), edge("AFFECTED", camp, "narr:faze-is-back"), edge("AFFECTED", camp, "narr:departure-risk", { direction: "possible backlash" }),
    edge("RESONATED_WITH", "cohort:og-trickshot", camp), edge("PURCHASED", "cohort:merch-buyers", camp),
    ...metrics.map((m) => edge(m.id === "sim:m:revenue" ? "GENERATED" : "MEASURES", m.id === "sim:m:revenue" ? camp : m.id, m.id === "sim:m:revenue" ? m.id : camp)),
  ];
  return {
    scenarioId: "scenario-nostalgia-campaign-001",
    title: "Nostalgia relaunch: ILLCAMS 51 with G FUEL",
    graphSnapshotId: SNAPSHOT_ID,
    label: "SIMULATED",
    engine: "MiroFish v0.1.2 (values are mock)",
    generatedAt: DEMO_NOW,
    assumptions: [
      "The Mar 2026 $10,000 MW2 trickshot challenge (4.43M views) is the closest precedent.",
      "G FUEL's 2024 revival with an equity stake is assumed to extend to a one-off drop.",
      "Cohort lift figures are placeholders until a calibrated model exists.",
    ],
    predictedOutcomes: { qualifiedViews: 2_500_000, engagementLift: 0.18, purchaseConversion: 0.031, expectedRevenue: 180_000, backlashProbability: 0.12 },
    affectedCohorts: [
      { cohortId: "cohort:og-trickshot", liftEstimate: 0.27 }, { cohortId: "cohort:cod-sniping", liftEstimate: 0.19 },
      { cohortId: "cohort:dormant-returning", liftEstimate: 0.22 }, { cohortId: "cohort:merch-buyers", liftEstimate: 0.08 },
    ],
    recommendedCreators: [
      { personId: "person:temperrr", reason: "Invented the Temperrr Shot; still associated with FaZe Media.", fit: 0.86 },
      { personId: "person:kaysan", reason: "Runs FaZe Esports and has a CoD stake; reaches the CoD cohort.", fit: 0.64 },
      { personId: "person:gursh", reason: "Creative Lead at FaZe Media since Aug 2026.", fit: 0.58 },
    ],
    simulatedNodes: nodes,
    simulatedEdges: edges,
    simulatedMetrics: metrics,
  };
}
