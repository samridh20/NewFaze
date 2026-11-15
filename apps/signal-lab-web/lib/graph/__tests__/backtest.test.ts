import { describe, expect, it } from "vitest";
import { MockGraphDataProvider, SimulatedDataRejected } from "../mockProvider";
import { caseDossier, pairDossier, scenarioFromPoll, scorePair } from "../backtest";
import { BACKTEST_CASES, RANKING_PAIRS } from "../seed/backtests";
import { buildObservedSeed } from "../seed";
import { composeView } from "../view";
import { LAYERS, type BacktestCase, type Layer } from "../types";

const P = () => new MockGraphDataProvider();
const byId = (id: string) => BACKTEST_CASES.find((c) => c.id === id)!;
const ALL = new Set<Layer>(LAYERS.map((l) => l.id));
const DESIGN_SEVEN = ["faze5-2020", "faze1-2022", "faze-subathon-2024", "faze-subathon-ii-2025", "fazemas-2025", "mafiathon-2-2024", "mafiathon-3-2025"];

describe("case library (design Ch. 18)", () => {
  it("contains the seven design cases, the extra comparables and one prospective draft", () => {
    for (const id of DESIGN_SEVEN) expect(byId(id), id).toBeTruthy();
    expect(byId("ironmouse-subathon-2024")).toBeTruthy();
    expect(byId("streamer-games-2024")).toBeTruthy();
    expect(byId("streamer-games-2025")).toBeTruthy();
    const draft = byId("homecoming-week2-2026");
    expect(draft.split).toBe("prospective");
    expect(draft.lockedForecastSha256).toBeNull();
    expect(BACKTEST_CASES.filter((c) => c.split !== "prospective").every((c) => c.split === "holdout")).toBe(true);
  });
  it("stores lower bounds as numbers with bound=lower, and leaves unknowns empty with placeholders", () => {
    const apps = byId("faze5-2020").outcomes.find((o) => o.id === "faze5-apps")!;
    expect(apps.value).toBe(211000);
    expect(apps.bound).toBe("lower");
    for (const c of BACKTEST_CASES) {
      expect(c.placeholders.length, c.id).toBeGreaterThan(0);
      expect(c.brief.archiveUrl).toBeNull();
      for (const o of c.outcomes) { expect(o.archiveUrl).toBeNull(); expect(o.capturedAt).toBeNull(); }
    }
  });
  it("marks FaZe1 submissions unscorable, FaZe1 viewer metrics shocked and every FaZemas metric shocked", () => {
    const f1 = byId("faze1-2022");
    expect(f1.outcomes.find((o) => o.metric === "submissions")).toMatchObject({ value: null, scorable: false, shock: false });
    expect(f1.outcomes.filter((o) => o.metric !== "submissions").every((o) => o.shock)).toBe(true);
    expect(byId("fazemas-2025").outcomes.every((o) => o.shock)).toBe(true);
    expect(byId("faze-subathon-ii-2025").outcomes.find((o) => o.id === "sub25-total")).toMatchObject({ value: null, scorable: false });
  });
  it("tags provenance (organizer reported or third party) and cites a source for every outcome", () => {
    const sources = new Set(buildObservedSeed().sources.map((s) => s.id));
    for (const c of BACKTEST_CASES) for (const o of c.outcomes) {
      expect(["organizer_reported", "third_party"]).toContain(o.provenance);
      expect(o.sourceIds.length).toBeGreaterThan(0);
      o.sourceIds.forEach((s) => expect(sources.has(s), `${c.id}/${o.id} -> ${s}`).toBe(true));
    }
    expect(byId("faze5-2020").outcomes[0].provenance).toBe("organizer_reported");
    expect(byId("ironmouse-subathon-2024").outcomes[0].provenance).toBe("third_party");
  });
  it("links every scorable outcome to a graph metric node, and every case to a graph subject", async () => {
    const p = P();
    const exists = async (id: string) => (await p.getNodeHistory(id)) !== null; // history includes nodes that have since ended
    for (const c of BACKTEST_CASES) {
      expect(await exists(c.subjectNodeId), `${c.id} subject ${c.subjectNodeId}`).toBe(true);
      for (const e of c.entities) expect(await exists(e), `${c.id} entity ${e}`).toBe(true);
      for (const o of c.outcomes) if (o.metricNodeId) expect(await exists(o.metricNodeId), `${c.id}/${o.id}`).toBe(true);
    }
  });
  it("dates every outcome after its T0 cutoff, so a snapshot at T0 cannot contain it", async () => {
    const p = P();
    for (const c of BACKTEST_CASES) {
      const snap = await p.getSnapshot(c.t0Cutoff);
      for (const o of c.outcomes) if (o.metricNodeId) expect(snap.nodes.some((n) => n.id === o.metricNodeId), `${c.id}/${o.id} leaks into its own T0 snapshot`).toBe(false);
    }
    const later = await p.getSnapshot("2020-12-31T00:00:00Z");
    expect(later.nodes.some((n) => n.id === "m:bt-faze5-apps")).toBe(true); // visible once resolved
  });
  it("has real ranking pairs with the design's actual winners and the sequel baseline", () => {
    const p = RANKING_PAIRS.find((x) => x.id === "pair-faze5-vs-faze1")!;
    expect(p).toMatchObject({ actualWinnerCaseId: "faze5-2020", baselineRule: "later edition wins", runnable: true });
    expect(RANKING_PAIRS.find((x) => x.id === "pair-mafiathon-2-vs-3")!.actualWinnerCaseId).toBe("mafiathon-3-2025");
    expect(RANKING_PAIRS.find((x) => x.id === "pair-streamer-games")!.actualWinnerCaseId).toBe("streamer-games-2025");
    expect(RANKING_PAIRS.find((x) => x.id === "pair-subathon-2024-vs-2025")!.actualWinnerCaseId).toBeNull();
    // the sequel baseline calls both sequels right and FaZe1 wrong
    expect(RANKING_PAIRS.filter((x) => x.actualWinnerCaseId).map((x) => x.laterCaseId === x.actualWinnerCaseId)).toEqual([false, true, true]);
  });
});

describe("as-of dossier: no look-ahead", () => {
  const outcomeNumbers = (c: BacktestCase) => c.outcomes.filter((o) => o.value !== null).flatMap((o) => [o.value!.toLocaleString("en"), String(o.value)]).filter((n) => n.length >= 3); // a single digit like "5 creators" is not a distinctive string

  it("passes its own leak check and withholds every outcome, for every case, masked and unmasked", async () => {
    const p = P();
    for (const c of BACKTEST_CASES) for (const mask of [false, true]) {
      const d = await caseDossier(p, c, { mask });
      expect(d.manifest.leakCheck.hits, `${c.id} mask=${mask}`).toEqual([]);
      for (const n of outcomeNumbers(c)) expect(d.text, `${c.id} contains outcome ${n}`).not.toContain(n);
      if (c.split !== "prospective") expect(d.manifest.withheld.afterCutoff, c.id).toBeGreaterThan(0); // a prospective case has no future in the data yet
    }
  });
  it("contains nothing that happened after the FaZe5 2020 cutoff", async () => {
    const d = await caseDossier(P(), byId("faze5-2020"), { mask: false });
    for (const later of ["FaZe1", "Rollbit", "HardScope", "CORE", "Subathon", "GameSquare", "exodus", "Nasdaq", "Kalish", "Halo World", "Six Invitational", "SPAC"]) expect(d.text, later).not.toContain(later);
    expect(d.text).toContain("FAZE5");              // the 2013 and 2014 editions are legitimately known
    expect(d.text).toContain("G FUEL");
    expect(d.text).toContain("Atlanta FaZe");       // announced Oct 2019
    expect(d.manifest.asOf).toBe("2020-09-03T00:00:00Z");
  });
  it("shows a role as 'since' and never prints its future end date", async () => {
    const d = await caseDossier(P(), byId("faze-subathon-ii-2025"), { mask: false });
    expect(d.text).toMatch(/Adapt: Creator at FaZe Media since 16 May 2024/);
    expect(d.text).not.toContain("25 December 2025");
    expect(d.text).not.toContain("CORE");
    expect(d.text).not.toMatch(/Banks:.*CEO at FaZe Media/); // ended 28 Jul 2025, before this cutoff
  });
  it("includes known-at-T0 factors and the brief, and cuts at the stated T0", async () => {
    const d = await caseDossier(P(), byId("faze-subathon-2024"), { mask: false });
    expect(d.text).toContain("SUBtember");
    expect(d.text).toContain("Six creators go live all month");
    expect(d.manifest.asOf).toBe("2024-08-30T00:00:00Z");
    expect(d.text).toContain("CEO at FaZe Media since 16 May 2024");   // known by then (FaZe Media formed before T0)
    expect(d.text).not.toContain("Rollbit");                             // signed a year later
  });
  it("withholds mock, simulated and inferred facts by default and labels the rest with status and source", async () => {
    const p = P();
    const d = await p.buildDossier({ asOf: "2026-11-15T00:00:00Z", title: "now" });
    expect(d.text).not.toMatch(/MOCK|mock|SIM|simulated/);
    expect(d.manifest.withheld.mock).toBeGreaterThan(0);
    expect(d.manifest.withheld.inferred).toBeGreaterThan(0);
    expect(d.text).toMatch(/\[verified; /);
    const withInferred = await p.buildDossier({ asOf: "2026-11-15T00:00:00Z", title: "now", includeInferred: true });
    expect(withInferred.text).toContain("Narratives in the community (inferred)");
    expect(withInferred.text).not.toMatch(/MOCK/);
  });
  it("never reads the simulation store", async () => {
    const p = P();
    const before = (await p.buildDossier({ asOf: "2026-11-15T00:00:00Z", title: "x" })).text;
    await p.loadSimulation("scenario-nostalgia-campaign-001");
    expect((await p.buildDossier({ asOf: "2026-11-15T00:00:00Z", title: "x" })).text).toBe(before);
    expect(before).not.toContain("Trickshot Reunion");
  });
  it("respects the size budget and reports what it trimmed", async () => {
    const d = await P().buildDossier({ asOf: "2026-11-15T00:00:00Z", title: "now", maxChars: 3000 });
    expect(d.text.length).toBeLessThan(3400);
    expect(d.text).toMatch(/lower-priority lines were trimmed/);
  });
});

describe("masking", () => {
  it("removes the organisation, every creator name and the original years", async () => {
    const d = await caseDossier(P(), byId("faze1-2022"), { mask: true });
    expect(d.text).not.toMatch(/faze/i);
    for (const name of ["Banks", "Apex", "Temperrr", "Rug", "Adapt", "Kaysan", "Swagg", "Scope"]) expect(d.text, name).not.toContain(name);
    expect(d.text).not.toMatch(/The Warehouse|MoonPay|ILLCAMS|Teamtage|Atlanta/);
    expect(d.text).toContain("Org A");
    expect(d.text).toMatch(/Creator \d+/);
    expect(d.manifest.masked).toBe(true);
    expect(d.manifest.leakCheck.passed).toBe(true);
  });
  it("shifts dates by a fixed offset but keeps the platform, format and brands", async () => {
    const plain = await caseDossier(P(), byId("faze1-2022"), { mask: false });
    const masked = await caseDossier(P(), byId("faze1-2022"), { mask: true });
    expect(plain.text).toContain("Creator at FaZe Clan since 3 August 2010");
    expect(masked.text).not.toContain("3 August 2010");
    expect(masked.text).toContain("Creator at Org A since 24 September 2011");   // 3 Aug 2010 + 417 days
    expect(masked.text).toContain("G FUEL");                                      // brands stay
    expect(masked.text).toMatch(/YouTube/);                                       // platform stays
  });
  it("is deterministic: the same case masks to the same text", async () => {
    const a = await caseDossier(P(), byId("faze5-2020"), { mask: true }), b = await caseDossier(P(), byId("faze5-2020"), { mask: true });
    expect(a.text).toBe(b.text);
  });
});

describe("pair dossier for the FaZe5 vs FaZe1 case study", () => {
  const pair = () => RANKING_PAIRS.find((x) => x.id === "pair-faze5-vs-faze1")!;
  it("cuts at the earlier T0, offers both briefs as Challenge 1 and 2, and holds neither outcome", async () => {
    const r = await pairDossier(P(), pair(), BACKTEST_CASES, { mask: true });
    expect(r.cutoff).toBe("2020-09-03T00:00:00Z");
    expect(r.options).toEqual([{ label: "Challenge 1", caseId: "faze5-2020" }, { label: "Challenge 2", caseId: "faze1-2022" }]);
    expect(r.dossier.text).toContain("Challenge 1");
    expect(r.dossier.text).toContain("Challenge 2");
    expect(r.dossier.text).toMatch(/five spots/i);
    expect(r.dossier.text).toMatch(/one spot/i);
    expect(r.dossier.text).not.toMatch(/faze/i);
    expect(r.dossier.text).not.toMatch(/211|thousands|600,000|42M|2,800/i);
    const briefs = r.dossier.text.slice(r.dossier.text.indexOf("## The announcements"));
    expect(briefs).not.toMatch(/\b(19|20)\d{2}\b/);                      // no calendar years in the briefs
    expect(briefs).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    expect(r.dossier.manifest.leakCheck.passed).toBe(true);
  });
  it("can swap the order to expose position bias", async () => {
    const r = await pairDossier(P(), pair(), BACKTEST_CASES, { mask: true, swap: true });
    expect(r.options[0].caseId).toBe("faze1-2022");
    expect(r.dossier.text.search(/one spot/i)).toBeLessThan(r.dossier.text.search(/five spots/i));
  });
  it("keeps the prize asymmetry that makes this the hard pair", async () => {
    const r = await pairDossier(P(), pair(), BACKTEST_CASES, { mask: true });
    expect(r.dossier.text).toContain("$20,000");
    expect(r.dossier.text).toContain("$1 million");
  });
});

describe("turning MiroFish output into a simulation scenario", () => {
  const args = (choices: (string | null)[]) => ({
    id: "t1", title: "t", snapshotId: "snapshot-x", question: "Which would you enter?",
    options: [{ label: "Challenge 1", caseId: "faze5-2020" }, { label: "Challenge 2", caseId: "faze1-2022" }], contextNodeId: "org:faze-clan",
    agents: choices.map((c, i) => ({ agentId: i, name: `Agent ${i}`, choice: c, reason: "because" })),
    mirofish: { projectId: "p", simulationId: "s" }, modelNote: "note",
  });
  it("creates only simulated records, tallies the choices and names the winner", () => {
    const s = scenarioFromPoll(args(["Challenge 1", "Challenge 1", "Challenge 2", null]));
    expect([...s.simulatedNodes, ...s.simulatedEdges].every((x) => x.origin === "simulated" && x.temporal.status === "simulated")).toBe(true);
    expect(s.backtest).toMatchObject({ tally: { "Challenge 1": 2, "Challenge 2": 1 }, undecided: 1, predictedWinner: "Challenge 1" });
    expect(s.simulatedEdges.filter((e) => e.type === "RESONATED_WITH").every((e) => e.to.startsWith("sim:option:"))).toBe(true);
    expect(s.simulatedEdges.some((e) => e.type === "ASSOCIATED_WITH" && e.to === "org:faze-clan")).toBe(true); // context is the observed org
    expect(s.label).toBe("SIMULATED");
  });
  it("reports a tie as no call", () => {
    expect(scenarioFromPoll(args(["Challenge 1", "Challenge 2"])).backtest!.predictedWinner).toBeNull();
  });
  it("shows up in Simulation mode, and never in the observed view or the fact store", async () => {
    const p = P();
    const s = scenarioFromPoll(args(["Challenge 1", "Challenge 1", "Challenge 2"]));
    const before = (await p.getSnapshot("current")).nodes.length;
    await p.saveSimulation(s);
    const snap = await p.getSnapshot("current");
    expect(snap.nodes.length).toBe(before);
    expect(snap.nodes.some((n) => n.id.startsWith("sim:"))).toBe(false);
    const sim = composeView({ snapshot: snap, scenario: await p.loadSimulation(s.scenarioId), mode: "simulation", layers: ALL });
    expect(sim.nodes.filter((n) => n.origin === "simulated").length).toBe(s.simulatedNodes.length);
    expect(composeView({ snapshot: snap, scenario: s, mode: "observed", layers: ALL }).nodes.some((n) => n.origin === "simulated")).toBe(false);
  });
  it("refuses to save a scenario that smuggles in an observed or colliding record", async () => {
    const p = P();
    const s = scenarioFromPoll(args(["Challenge 1"]));
    await expect(p.saveSimulation({ ...s, simulatedNodes: [{ ...s.simulatedNodes[0], origin: "observed" }] })).rejects.toBeInstanceOf(SimulatedDataRejected);
    await expect(p.saveSimulation({ ...s, simulatedNodes: [{ ...s.simulatedNodes[0], id: "person:banks" }] })).rejects.toBeInstanceOf(SimulatedDataRejected);
  });
});

describe("scoring a pair against the sequel baseline", () => {
  const pair = RANKING_PAIRS[0];
  const forecast = (winner: string | null) => ({ caseId: "x", kind: "pair" as const, question: "", options: [{ label: "Challenge 1", caseId: "faze5-2020" }, { label: "Challenge 2", caseId: "faze1-2022" }], tally: {}, undecided: 0, agents: [], predictedWinner: winner, mirofish: { projectId: null, simulationId: null }, modelNote: "" });
  it("credits a right call that the sequel baseline gets wrong", () => {
    const s = scorePair(pair, forecast("Challenge 1"), BACKTEST_CASES, false);
    expect(s).toMatchObject({ correct: true, baselineCorrect: false, beatsBaseline: true, countsTowardGate: true });
    expect(s.verdict).toMatch(/beats the baseline/);
  });
  it("marks a prize-size call as wrong, like the baseline", () => {
    expect(scorePair(pair, forecast("Challenge 2"), BACKTEST_CASES, false)).toMatchObject({ correct: false, baselineCorrect: false, beatsBaseline: false });
  });
  it("reports leaky runs but keeps them out of the gate, and scores a tie as no call", () => {
    expect(scorePair(pair, forecast("Challenge 1"), BACKTEST_CASES, true)).toMatchObject({ leaky: true, countsTowardGate: false });
    expect(scorePair(pair, forecast(null), BACKTEST_CASES, false).correct).toBe(false);
  });
  it("says a sequel win adds no evidence, and an unscorable pair cannot be scored", () => {
    const maf = RANKING_PAIRS.find((x) => x.id === "pair-mafiathon-2-vs-3")!;
    const f = { ...forecast("Challenge 2"), options: [{ label: "Challenge 1", caseId: "mafiathon-2-2024" }, { label: "Challenge 2", caseId: "mafiathon-3-2025" }] };
    expect(scorePair(maf, f, BACKTEST_CASES, false).verdict).toMatch(/adds no evidence/);
    const sub = RANKING_PAIRS.find((x) => x.id === "pair-subathon-2024-vs-2025")!;
    expect(scorePair(sub, forecast("Challenge 1"), BACKTEST_CASES, false)).toMatchObject({ scorable: false, countsTowardGate: false });
  });
});
