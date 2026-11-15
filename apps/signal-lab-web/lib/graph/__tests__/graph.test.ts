import { describe, expect, it } from "vitest";
import { MockGraphDataProvider, SimulatedDataRejected } from "../mockProvider";
import { buildObservedSeed } from "../seed";
import { composeView, layerOf } from "../view";
import { findNearest, findPath, isAudience, isRevenue } from "../pathfinding";
import { betweenness, nodeStats } from "../stats";
import { DEMO_EVENTS } from "../demoStream";
import { isValidAt } from "../temporal";
import { LAYERS, type Layer } from "../types";

const ALL = new Set<Layer>(LAYERS.map((l) => l.id));
const NO_EVIDENCE = new Set<Layer>(LAYERS.map((l) => l.id).filter((l) => l !== "evidence"));
const fresh = () => new MockGraphDataProvider();
const view = async (p: MockGraphDataProvider, asOf: string, mode: "observed" | "simulation" | "compare" = "observed", layers = NO_EVIDENCE) => {
  const snapshot = await p.getSnapshot(asOf as never);
  const scenario = await p.loadSimulation("scenario-nostalgia-campaign-001");
  return composeView({ snapshot, scenario, mode, layers });
};
const has = (v: { nodes: { id: string }[] }, id: string) => v.nodes.some((n) => n.id === id);
const assignments = (snap: { nodes: { id: string; category: string; name: string }[] }, person: string, rels: { type: string; from: string; to: string }[]) =>
  rels.filter((r) => r.type === "HAS_ASSIGNMENT" && r.from === person).map((r) => snap.nodes.find((n) => n.id === r.to)?.name);

describe("seed integrity", () => {
  const seed = buildObservedSeed();
  it("has unique ids and no dangling relationships", () => {
    const ids = seed.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const set = new Set(ids);
    expect(seed.relationships.filter((r) => !set.has(r.from) || !set.has(r.to))).toEqual([]);
  });
  it("gives every observed relationship a known source, a confidence and a status", () => {
    const sources = new Set(seed.sources.map((s) => s.id));
    for (const r of seed.relationships) {
      expect(sources.has(r.temporal.sourceId), `${r.id} -> ${r.temporal.sourceId}`).toBe(true);
      expect(r.temporal.confidence).toBeGreaterThan(0);
      expect(r.temporal.status).toBeTruthy();
    }
  });
  it("closes intervals in the right order and never uses causal relationship types", () => {
    for (const r of seed.relationships) {
      if (r.temporal.validFrom && r.temporal.validTo) expect(Date.parse(r.temporal.validTo), r.id).toBeGreaterThan(Date.parse(r.temporal.validFrom));
      expect(r.type as string).not.toBe("CAUSED_BY");
    }
  });
  it("marks invented numbers as mock and keeps simulated records out of the observed seed", () => {
    expect(seed.metrics.filter((m) => m.label.startsWith("MOCK")).every((m) => m.status === "mock")).toBe(true);
    expect(seed.nodes.some((n) => n.origin === "simulated") || seed.relationships.some((r) => r.origin === "simulated")).toBe(false);
  });
  it("is big enough to be a realistic load: 100+ nodes and 300+ relationships", () => {
    expect(seed.nodes.length).toBeGreaterThanOrEqual(100);
    expect(seed.relationships.length).toBeGreaterThanOrEqual(300);
    expect(seed.nodes.filter((n) => n.category === "audience_cohort").length).toBeGreaterThanOrEqual(6);
    expect(seed.nodes.filter((n) => n.category === "narrative").length).toBeGreaterThanOrEqual(6);
  });
});

describe("canonical people and alias resolution", () => {
  it("has exactly one node per person, and every alias collision is deliberate", async () => {
    const p = fresh();
    const { nodes } = await p.getSnapshot("current");
    const people = nodes.filter((n) => n.category === "person");
    const seen = new Map<string, string[]>();
    for (const n of people) for (const a of new Set([n.name, ...n.aliases].map((x) => x.toLowerCase()))) seen.set(a, [...(seen.get(a) ?? []), n.id]);
    const collisions = [...seen].filter(([, ids]) => ids.length > 1).map(([a]) => a);
    expect(collisions).toEqual(["rain"]);
  });
  it("resolves aliases to the canonical person", async () => {
    const p = fresh();
    expect((await p.resolveAlias("FaZe Rain")).candidates.map((c) => c.id)).toEqual(["person:rain-nordan"]);
    expect((await p.resolveAlias("Havard Nygaard")).candidates.map((c) => c.id)).toEqual(["person:rain-havard"]);
    expect((await p.resolveAlias("House Cat")).candidates.map((c) => c.id)).toEqual(["person:timid"]);
    expect((await p.resolveAlias("Banks")).candidates.map((c) => c.id)).toEqual(["person:banks"]);
  });
  it("keeps FaZe Twistt and Twistzz apart", async () => {
    const p = fresh();
    expect((await p.resolveAlias("FaZe Twistt")).candidates.map((c) => c.id)).toEqual(["person:twistt"]);
    expect((await p.resolveAlias("Twistzz")).candidates.map((c) => c.id)).toEqual(["person:twistzz"]);
  });
  it("says a bare alias is ambiguous instead of guessing", async () => {
    const r = await fresh().resolveAlias("rain");
    expect(r.ambiguous).toBe(true);
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["person:rain-havard", "person:rain-nordan"]);
    expect(r.candidates.every((c) => c.disambiguation)).toBe(true);
  });
  it("search matches aliases and reports which one matched", async () => {
    const hits = await fresh().search("house cat");
    expect(hits[0].node.id).toBe("person:timid");
    expect(hits[0].matchedAlias).toBe("House Cat");
  });
});

describe("temporal filtering", () => {
  const bankRoles = async (p: MockGraphDataProvider, asOf: string) => {
    const s = await p.getSnapshot(asOf as never);
    return assignments(s, "person:banks", s.relationships);
  };
  it("shows Banks' CEO role only inside its valid window, and brings history back when moving backwards", async () => {
    const p = fresh();
    expect(await bankRoles(p, "2023-01-01T00:00:00Z")).not.toContain("CEO @ FaZe Clan");
    expect(await bankRoles(p, "2024-04-01T00:00:00Z")).toContain("CEO @ FaZe Clan");
    expect(await bankRoles(p, "2025-01-01T00:00:00Z")).toContain("CEO @ FaZe Media");
    expect(await bankRoles(p, "2025-08-01T00:00:00Z")).not.toContain("CEO @ FaZe Media");
    expect(await bankRoles(p, "2024-04-01T00:00:00Z")).toContain("CEO @ FaZe Clan"); // moved back again: it reappears
  });
  it("uses half-open intervals", () => {
    const t = { validFrom: "2024-05-16T00:00:00Z", validTo: "2025-04-01T00:00:00Z" };
    expect(isValidAt(t, "2024-05-16T00:00:00Z")).toBe(true);
    expect(isValidAt(t, "2025-04-01T00:00:00Z")).toBe(false);
    expect(isValidAt({ validFrom: null, validTo: null }, "1999-01-01T00:00:00Z")).toBe(true);
  });
  it("handles a roster change, a rename and a corporate ownership change", async () => {
    const p = fresh();
    const a = await view(p, "2025-06-01T00:00:00Z"), b = await view(p, "2026-05-01T00:00:00Z");
    const stint = (v: typeof a, who: string) => v.links.some((l) => l.type === "HAS_ASSIGNMENT" && l.source === who && String(l.target).startsWith(`ra:${who.split(":")[1]}:player`));
    expect(stint(a, "person:karrigan")).toBe(true);
    expect(stint(b, "person:karrigan")).toBe(false);
    expect(has(await view(p, "2025-01-01T00:00:00Z"), "team:atlanta")).toBe(true);
    expect(has(await view(p, "2025-01-01T00:00:00Z"), "team:vegas")).toBe(false);
    expect(has(await view(p, "2026-01-01T00:00:00Z"), "team:vegas")).toBe(true);
    expect(has(await view(p, "2023-01-01T00:00:00Z"), "org:faze-holdings")).toBe(true);
    expect(has(await view(p, "2025-01-01T00:00:00Z"), "org:faze-holdings")).toBe(false);
    expect(has(await view(p, "2023-01-01T00:00:00Z"), "org:faze-media")).toBe(false);
  });
  it("models a creator departure by closing, not deleting", async () => {
    const p = fresh();
    const before = await p.getSnapshot("2025-12-01T00:00:00Z"), after = await p.getSnapshot("2026-01-15T00:00:00Z");
    const open = (s: typeof before) => s.relationships.filter((r) => r.type === "HAS_ASSIGNMENT" && r.from === "person:adapt").length;
    expect(open(before)).toBeGreaterThan(0);
    expect(open(after)).toBe(0); // gone after 25 Dec 2025 ...
    expect(open(await p.getSnapshot("2026-05-01T00:00:00Z"))).toBe(1); // ... and the CORE assignment starts on 30 Apr 2026
  });
  it("keeps one Person node while showing several roles", async () => {
    const snap = await fresh().getSnapshot("2024-04-01T00:00:00Z");
    expect(snap.nodes.filter((n) => n.id === "person:banks")).toHaveLength(1);
    const roles = assignments(snap, "person:banks", snap.relationships);
    expect(roles).toContain("CEO @ FaZe Clan");
  });
});

describe("observed vs simulated separation", () => {
  it("never contains simulated records in the observed snapshot or observed view", async () => {
    const p = fresh();
    const snap = await p.getSnapshot("current");
    expect(snap.nodes.some((n) => n.origin === "simulated")).toBe(false);
    expect(snap.relationships.some((r) => r.origin === "simulated")).toBe(false);
    const v = await view(p, "current", "observed");
    expect(v.nodes.some((n) => n.origin === "simulated")).toBe(false);
    expect(v.simulationShown).toBe(false);
  });
  it("shows simulated records only in simulation or compare mode, flagged and dashed", async () => {
    const p = fresh();
    const sim = await view(p, "current", "simulation"), cmp = await view(p, "current", "compare");
    expect(sim.simulationShown && cmp.simulationShown).toBe(true);
    const simOnly = sim.nodes.filter((n) => n.origin === "simulated");
    expect(simOnly.length).toBeGreaterThan(0);
    expect(simOnly.every((n) => n.temporal.status === "simulated")).toBe(true);
    expect(cmp.links.filter((l) => l.origin === "simulated").every((l) => l.dashed)).toBe(true);
    expect(cmp.nodes.filter((n) => n.origin === "observed").length).toBe((await view(p, "current", "observed")).nodes.length);
  });
  it("leaves the observed store untouched after a simulation is loaded", async () => {
    const p = fresh();
    const a = await p.getSnapshot("current");
    await p.loadSimulation("scenario-nostalgia-campaign-001");
    const b = await p.getSnapshot("current");
    expect(b.nodes.length).toBe(a.nodes.length);
    expect(b.nodes.some((n) => n.id.startsWith("sim:"))).toBe(false);
  });
  it("refuses to store simulated data through applyEvent", async () => {
    const p = fresh();
    await expect(p.applyEvent({ id: "x", type: "campaign_launched", at: "2026-11-16T00:00:00Z", demo: true, sourceId: "src-demo-stream", payload: { id: "camp:bad", name: "Bad", origin: "simulated" } })).rejects.toBeInstanceOf(SimulatedDataRejected);
    expect((await p.getSnapshot("2027-01-01T00:00:00Z")).nodes.some((n) => n.id === "camp:bad")).toBe(false);
  });
  it("hides the scenario on dates before its snapshot", async () => {
    const v = await view(fresh(), "2024-01-01T00:00:00Z", "compare");
    expect(v.simulationShown).toBe(false);
    expect(v.simulationNote).toMatch(/snapshot/);
  });
  it("does not merge simulated edges into observed relationships", async () => {
    const sc = await fresh().loadSimulation("scenario-nostalgia-campaign-001");
    expect(sc.simulatedEdges.every((e) => e.origin === "simulated" && e.temporal.status === "simulated")).toBe(true);
    expect(sc.label).toBe("SIMULATED");
  });
});

describe("incremental demo events", () => {
  it("applies the stream, labels everything demo/mock, and preserves history", async () => {
    const p = fresh();
    const log: string[] = [];
    p.subscribe((e) => log.push(e.summary));
    const before = await p.getSnapshot("2026-11-15T00:00:00Z");
    for (const e of DEMO_EVENTS) await p.applyEvent(e);
    expect(log).toHaveLength(DEMO_EVENTS.length);
    expect(log.every((s) => s.startsWith("[demo]"))).toBe(true);
    const mid = await p.getSnapshot("2026-11-18T00:00:00Z");
    const created = mid.nodes.find((n) => n.id === "person:demo-newcomer")!;
    expect(created.demo).toBe(true);
    expect(created.temporal.status).toBe("mock");
    const late = await p.getSnapshot("2026-11-30T00:00:00Z");
    expect(late.relationships.filter((r) => r.type === "HAS_ASSIGNMENT" && r.from === "person:demo-newcomer").length).toBe(0); // departed
    expect((await p.getSnapshot("2026-11-18T00:00:00Z")).relationships.filter((r) => r.type === "HAS_ASSIGNMENT" && r.from === "person:demo-newcomer").length).toBe(1); // history kept
    expect((await p.getSnapshot("2026-11-15T00:00:00Z")).nodes.length).toBe(before.nodes.length); // earlier dates unaffected
    expect((await p.getEventLog())).toHaveLength(DEMO_EVENTS.length);
  });
  it("records a metric update as a new observation rather than overwriting", async () => {
    const p = fresh();
    for (const e of DEMO_EVENTS.slice(0, 2)) await p.applyEvent(e);
    await p.applyEvent(DEMO_EVENTS[5]);
    const s = await p.getSnapshot("2026-12-01T00:00:00Z");
    expect(s.nodes.filter((n) => n.category === "metric" && n.name.includes("Nova")).length).toBe(2);
  });
});

describe("path exploration", () => {
  it("traces an esports championship to an audience cohort through content, then on to a sponsor campaign and revenue", async () => {
    const v = await view(fresh(), "current");
    const toAudience = findNearest(v, "ev:ewc-r6-2026", isAudience)!;
    const cats = toAudience.nodeIds.map((id) => v.nodes.find((n) => n.id === id)!.category);
    expect(cats).toEqual(["event", "content_asset", "audience_cohort"]);
    expect(toAudience.containsInferred).toBe(true); // cohort hops are inferred, and the UI says so
    const cohort = toAudience.nodeIds[toAudience.nodeIds.length - 1];
    const toRevenue = findNearest(v, cohort, isRevenue)!;
    const rc = toRevenue.nodeIds.map((id) => v.nodes.find((n) => n.id === id)!.category);
    expect(rc).toEqual(["audience_cohort", "campaign", "metric"]);
    expect(toRevenue.nodeIds[toRevenue.nodeIds.length - 1]).toBe("m:rollbit-revenue");
  });
  it("also finds a direct route from the championship to the Rollbit revenue figure", async () => {
    const v = await view(fresh(), "current");
    expect(findPath(v, "ev:ewc-r6-2026", "m:rollbit-revenue")).not.toBeNull();
  });
  it("connects the R6 team to merchandise revenue and flags the mock end", async () => {
    const v = await view(fresh(), "current");
    const path = findPath(v, "team:r6", "m:mock-merch-revenue")!;
    expect(path).not.toBeNull();
    expect(path.containsInferred).toBe(true);
  });
  it("does not shortcut through source or claim nodes", async () => {
    const v = await view(fresh(), "current", "observed", ALL);
    const path = findPath(v, "person:banks", "person:kalish")!;
    const cats = path.nodeIds.slice(1, -1).map((id) => v.nodes.find((n) => n.id === id)!.category);
    expect(cats.includes("source") || cats.includes("claim")).toBe(false);
  });
  it("returns null when an endpoint is not visible at the chosen date", async () => {
    expect(findPath(await view(fresh(), "2015-01-01T00:00:00Z"), "person:banks", "team:r6")).toBeNull();
  });
});

describe("statistics and performance", () => {
  it("reports degree, bridge score and dependency for a selected node", async () => {
    const v = await view(fresh(), "current");
    const bc = betweenness(v);
    const s = nodeStats(v, "org:faze-media", bc);
    expect(s.degree).toBe(v.links.filter((l) => l.source === "org:faze-media" || l.target === "org:faze-media").length);
    expect(s.betweenness).toBeGreaterThanOrEqual(0);
    expect(s.betweenness).toBeLessThanOrEqual(1);
    const rollbit = nodeStats(v, "camp:rollbit", bc);
    expect(rollbit.revenuePaths.some((r) => r.id === "m:rollbit-revenue")).toBe(true);
    expect(rollbit.cohorts.length).toBeGreaterThan(0);
    expect(nodeStats(v, "org:faze-clan", bc).dependency.label).toBe("n/a");
  });
  it("composes, scores and routes a full-evidence view quickly", async () => {
    const p = fresh();
    const t0 = performance.now();
    const v = await view(p, "current", "compare", ALL);
    betweenness(v); findPath(v, "ev:ewc-r6-2026", "m:rollbit-revenue");
    expect(v.nodes.length).toBeGreaterThanOrEqual(100);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it("stays usable on a synthetic 150-node, 400-edge graph", () => {
    const nodes = Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, category: "person", degree: 0 }));
    const links = Array.from({ length: 400 }, (_, i) => ({ id: `e${i}`, source: `n${(i * 7) % 150}`, target: `n${(i * 13 + 5) % 150}`, type: "ASSOCIATED_WITH", dashed: false, origin: "observed", status: "verified", confidence: 1 }));
    const t0 = performance.now();
    const v = { nodes: nodes as never, links: links as never };
    betweenness(v); findPath(v, "n0", "n99");
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it("assigns every node to exactly one layer", async () => {
    const snap = await fresh().getSnapshot("current");
    for (const n of snap.nodes) expect(LAYERS.map((l) => l.id)).toContain(layerOf(n));
  });
});
