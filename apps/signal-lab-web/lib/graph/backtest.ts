import type {
  BacktestCase, BacktestForecast, BacktestScore, DossierOptions, GraphDataProvider, GraphNode, GraphRelationship, MetricObservation, RankingPair, SimulationScenario,
} from "./types";
import { DEMO_NOW } from "./temporal";

const MASK_ALIAS = "Org A";
const SHIFT_DAYS = 417;                 // fixed offset: design Ch. 18 shifts dates while keeping the platform and format
// Series names and branded terms that identify the organisation on their own. Platform, format and sponsors stay (design Ch. 18).
const GENERIC_TERMS: [string, string][] = [
  ["The Warehouse", "a purpose-built studio house"], ["MoonPay", "a crypto exchange"], ["ILLCAMS", "Killcam series"], ["ILLFEEDS", "Feed series"],
  ["Teamtages", "Team montages"], ["Teamtage", "Team montage"], ["Atlanta", "Franchise"], ["Plainview", "a suburban town"],
];

const outcomeTerms = (c: BacktestCase): string[] =>
  c.outcomes.flatMap((o) => (o.value === null ? [] : [o.value.toLocaleString("en"), String(o.value), `${o.value / 1000}K`, `${o.value / 1e6}M`])).filter((t) => t.length >= 3);

/** The dossier a single case would be run on: cut at T0, outcomes withheld, optionally masked. */
export async function caseDossier(provider: GraphDataProvider, c: BacktestCase, o: { mask: boolean; includeInferred?: boolean }) {
  const opts: DossierOptions = {
    asOf: c.t0Cutoff, title: o.mask ? `Briefing: ${MASK_ALIAS} event` : `Briefing: ${withoutLaterYears(c.title, c.t0Cutoff)}`, focusIds: c.entities,
    includeInferred: o.includeInferred ?? false,
    briefs: c.brief.text ? [{ label: "Announcement", text: applyTerms(c.brief.text, c, o.mask), sourceIds: c.brief.sourceIds }] : [],
    knownAtT0: c.knownAtT0.map((k) => ({ label: k.label, value: k.value })),
    forbiddenTerms: outcomeTerms(c), placeholders: c.placeholders,
    mask: o.mask ? { orgAlias: MASK_ALIAS, dateShiftDays: SHIFT_DAYS, terms: [...GENERIC_TERMS, ...c.masking.terms], labelNodes: true } : null,
  };
  return provider.buildDossier(opts);
}

/**
 * A ranking pair is one scrim with both briefs as variants. The world is the same for both, so the cut is the EARLIER T0:
 * the later brief is presented as a second announcement from the same organisation. Neither outcome is in the dossier.
 */
export async function pairDossier(provider: GraphDataProvider, pair: RankingPair, cases: BacktestCase[], o: { mask: boolean; swap?: boolean }) {
  const a = cases.find((c) => c.id === pair.earlierCaseId)!, b = cases.find((c) => c.id === pair.laterCaseId)!;
  const [first, second] = o.swap ? [b, a] : [a, b];
  const cut = [a, b].map((c) => c.t0Cutoff).sort()[0];
  const label = (n: number, c: BacktestCase) => ({ label: `Challenge ${n}`, text: applyTerms(c.brief.text ?? "", c, o.mask), sourceIds: c.brief.sourceIds });
  const dossier = await provider.buildDossier({
    asOf: cut, title: o.mask ? `Briefing: two announcements from ${MASK_ALIAS}` : `Briefing: ${pair.title}`,
    focusIds: [...new Set([...a.entities, ...b.entities])], includeInferred: false,
    briefs: [label(1, first), label(2, second)],
    knownAtT0: [], forbiddenTerms: [...outcomeTerms(a), ...outcomeTerms(b)], placeholders: [...a.placeholders, ...b.placeholders],
    mask: o.mask ? { orgAlias: MASK_ALIAS, dateShiftDays: SHIFT_DAYS, terms: [...GENERIC_TERMS, ...a.masking.terms, ...b.masking.terms], labelNodes: true } : null,
  });
  return { dossier, options: [{ label: "Challenge 1", caseId: first.id }, { label: "Challenge 2", caseId: second.id }], cutoff: cut };
}

/** A title like "Streamer Games, 2024" would tell a dossier cut in 2023 what year the event ran. Drop years after the cutoff. */
function withoutLaterYears(title: string, cutoff: string): string {
  const y = new Date(cutoff).getUTCFullYear();
  return title.replace(/,?\s*\b(20\d{2})\b/g, (m, yr) => (Number(yr) > y ? "" : m)).replace(/\s{2,}/g, " ").trim();
}

function applyTerms(text: string, c: BacktestCase, mask: boolean): string {
  if (!mask) return text;
  let t = text;
  // calendar dates and years in a brief identify the event; replace them with relative wording
  t = t.replace(/\b(Registration|Registration runs|Registration closes)[^.]*\d{4}\./gi, (m) => (/closes/i.test(m) ? "Registration closes in about three weeks." : "Registration is open for two weeks."));
  t = t.replace(/\b(\d{1,2}(–\d{1,2})? )?(January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?\b/g, "").replace(/\b20\d{2}\b/g, "");
  for (const [a, b] of [...GENERIC_TERMS, ...c.masking.terms]) t = t.replace(new RegExp(a, "gi"), b);
  return t.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
}

/** Converts a MiroFish poll into a simulation scenario. Everything it creates is origin "simulated" and kept out of the fact store. */
export function scenarioFromPoll(args: {
  id: string; title: string; snapshotId: string; question: string;
  options: { label: string; caseId: string }[];
  contextNodeId: string;
  agents: { agentId: number; name: string; choice: string | null; reason: string }[];
  mirofish: { projectId: string | null; simulationId: string | null }; modelNote: string;
}): SimulationScenario {
  const T = { validFrom: null, validTo: null, observedAt: DEMO_NOW, sourceId: "sim-mirofish-live", confidence: 0.4, status: "simulated" as const };
  const nodes: GraphNode[] = [], edges: GraphRelationship[] = [];
  const tally: Record<string, number> = Object.fromEntries(args.options.map((o) => [o.label, 0]));
  let undecided = 0;
  // The two announcements are their own simulated nodes (the real campaign nodes end in 2020 and 2022, so no single date shows
  // both). They hang off the organisation node, which exists at "Current". The mapping to real cases stays in attrs until reveal.
  const optionNode = new Map<string, string>();
  args.options.forEach((o, i) => {
    const id = `sim:option:${args.id}:${i}`;
    optionNode.set(o.label, id);
    nodes.push({ id, category: "campaign", subtype: "HypotheticalAnnouncement", name: `SIM: ${o.label}`, aliases: [], origin: "simulated", attrs: { caseId: o.caseId }, temporal: { ...T, note: "A briefing text shown to the simulated people. Not a real campaign node." } });
    edges.push({ id: `sim:${args.id}:ctx:${i}`, type: "ASSOCIATED_WITH", from: id, to: args.contextNodeId, origin: "simulated", temporal: T });
  });
  for (const a of args.agents) {
    const nid = `sim:agent:${args.id}:${a.agentId}`;
    nodes.push({ id: nid, category: "person", subtype: "SimulatedFan", name: `SIM fan: ${a.name}`, aliases: [], summary: a.reason, origin: "simulated", temporal: { ...T, note: "A MiroFish agent, not a real person." } });
    const opt = args.options.find((o) => o.label === a.choice);
    if (opt) { tally[opt.label]++; edges.push({ id: `sim:${args.id}:${a.agentId}:RESONATED_WITH`, type: "RESONATED_WITH", from: nid, to: optionNode.get(opt.label)!, origin: "simulated", temporal: T, props: { choice: opt.label, reason: a.reason } }); }
    else undecided++;
  }
  const ranked = Object.entries(tally).sort((x, y) => y[1] - x[1]);
  const winner = ranked.length > 1 && ranked[0][1] === ranked[1][1] ? null : ranked[0]?.[0] ?? null;
  const metricId = `sim:m:${args.id}:share`;
  nodes.push({ id: metricId, category: "metric", subtype: "Entries", name: `Predicted preference: ${ranked.map(([l, n]) => `${l} ${n}`).join(" vs ")}`, aliases: [], origin: "simulated", attrs: { value: ranked[0]?.[1] ?? 0, unit: "agents" }, temporal: T });
  args.options.forEach((o) => edges.push({ id: `sim:${args.id}:${o.label}:MEASURES`, type: "MEASURES", from: metricId, to: optionNode.get(o.label)!, origin: "simulated", temporal: T }));
  const forecast: BacktestForecast = {
    caseId: args.id, kind: "pair", question: args.question, options: args.options.map((o) => ({ label: o.label, caseId: o.caseId })),
    tally, undecided, agents: args.agents, predictedWinner: winner, mirofish: args.mirofish, modelNote: args.modelNote,
  };
  return {
    scenarioId: `scenario-backtest-${args.id}`, title: args.title, graphSnapshotId: args.snapshotId, label: "SIMULATED", engine: "MiroFish v0.1.2 (live agents)",
    generatedAt: DEMO_NOW, assumptions: ["Each agent answered once, in character. This is a small sample, not a forecast.", args.modelNote],
    affectedCohorts: [], recommendedCreators: [], simulatedNodes: nodes, simulatedEdges: edges, simulatedMetrics: [] as MetricObservation[], backtest: forecast,
  };
}

/** Scores a forecast against what happened. Leaky and shocked runs are reported but never count toward the gate. */
export function scorePair(pair: RankingPair, forecast: BacktestForecast, cases: BacktestCase[], leaky: boolean): BacktestScore {
  const win = forecast.options.find((o) => o.label === forecast.predictedWinner)?.caseId ?? null;
  const base = pair.laterCaseId;
  const scorable = pair.actualWinnerCaseId !== null;
  const correct = scorable && win ? win === pair.actualWinnerCaseId : scorable ? false : null;
  const baselineCorrect = scorable ? base === pair.actualWinnerCaseId : null;
  const shocked = [pair.earlierCaseId, pair.laterCaseId].some((id) => cases.find((c) => c.id === id)?.outcomes.some((o) => o.metric === pair.metric && o.shock));
  const counts = scorable && !leaky && !shocked;
  const name = (id: string | null) => cases.find((c) => c.id === id)?.title ?? "none";
  let verdict: string;
  if (!scorable) verdict = "Not scorable: the source has no number for one side.";
  else if (!win) verdict = "The simulated crowd tied, so there is no call to score.";
  else if (correct) verdict = baselineCorrect ? "Right, but so is the “later edition wins” baseline, so this adds no evidence." : "Right, and the “later edition wins” baseline is wrong. This beats the baseline.";
  else verdict = baselineCorrect ? "Wrong, and the baseline was right." : "Wrong, like the baseline.";
  if (leaky) verdict += " Marked leaky: reported on the scorecard, excluded from the gate.";
  return { pairId: pair.id, scorable, actualWinner: pair.actualWinnerCaseId ? name(pair.actualWinnerCaseId) : null, predictedWinner: win ? name(win) : null, correct, baselineWinner: name(base), baselineCorrect, beatsBaseline: correct === null || baselineCorrect === null ? null : correct && !baselineCorrect, leaky, countsTowardGate: counts, verdict };
}
