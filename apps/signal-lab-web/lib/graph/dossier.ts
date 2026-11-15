import { ms } from "./temporal";
import type { Dossier, DossierManifest, DossierOptions, GraphNode, GraphRelationship, MetricObservation, Source, Status } from "./types";

export interface DossierStore { nodes: GraphNode[]; rels: GraphRelationship[]; metrics: MetricObservation[]; sources: Source[] }

/**
 * Time-cut dossier: the text MiroFish reads before a backtest (design Ch. 18, "Keeping the answer out of the replay").
 *
 * Layer 1, data as of T0: a fact is included only if it was valid at the cutoff. Anything that starts later is withheld and
 * counted. A fact that is still open at the cutoff is written as "since <date>"; its future end date, note and summary are
 * never printed, because those can describe what happened next.
 * Layer 2, masking: the organisation, creators and dates can be replaced so the model cannot simply recall the event.
 * Every build runs a leak check and reports what it found.
 */
const SHOWN: Status[] = ["verified", "reported", "disputed"];
const REL_ALIVE = (t: { validFrom: string | null; validTo: string | null }, cut: number) =>
  (t.validFrom === null || ms(t.validFrom) <= cut) && (t.validTo === null || ms(t.validTo) > cut);

export function buildDossierFrom(store: DossierStore, o: DossierOptions): Dossier {
  const cut = ms(o.asOf);
  const byId = new Map(store.nodes.map((n) => [n.id, n]));
  const src = new Map(store.sources.map((s) => [s.id, s]));
  const withheld = { afterCutoff: 0, inferred: 0, mock: 0, blinded: 0 };
  const blind = new Set(o.blindMetricIds ?? []);
  const shift = o.mask?.dateShiftDays ?? 0;

  const when = (iso: string | null, prec?: string) => {
    if (!iso) return "an unknown date";
    const d = new Date(ms(iso) + shift * 864e5);
    if (prec === "year") return String(d.getUTCFullYear());
    const m = d.toLocaleString("en", { month: "long", timeZone: "UTC" });
    return prec === "month" ? `${m} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
  };
  const tag = (status: Status, sid: string) => `[${status}; ${src.get(sid)?.publisher ?? sid}]`;
  const usable = (n: { origin: string; demo?: boolean; temporal: { status: Status } }, kind: "node" | "rel"): boolean => {
    if (n.origin !== "observed" || n.demo || n.temporal.status === "mock" || n.temporal.status === "simulated") { withheld.mock++; return false; }
    if (n.temporal.status === "inferred" && !o.includeInferred) { withheld.inferred++; return false; }
    void kind;
    return SHOWN.includes(n.temporal.status) || o.includeInferred === true;
  };

  // ---- what exists at the cutoff
  const aliveNodes = new Map<string, GraphNode>();
  for (const n of store.nodes) {
    if (n.category === "source" || n.category === "claim" || n.category === "metric") continue;
    if (n.temporal.validFrom !== null && ms(n.temporal.validFrom) > cut) { withheld.afterCutoff++; continue; }
    if (n.temporal.validTo !== null && ms(n.temporal.validTo) <= cut) continue; // ended: only reachable as history through relationships
    aliveNodes.set(n.id, n);
  }
  const rels = store.rels.filter((r) => {
    if (r.temporal.validFrom !== null && ms(r.temporal.validFrom) > cut) { withheld.afterCutoff++; return false; }
    return true;
  });
  const alive = rels.filter((r) => REL_ALIVE(r.temporal, cut));
  const out = (id: string, type: string) => alive.filter((r) => r.type === type && r.from === id);
  const into = (id: string, type: string) => alive.filter((r) => r.type === type && r.to === id);
  const focus = new Set(o.focusIds ?? []);

  const sections: { title: string; lines: string[]; priority: number }[] = [];
  const add = (title: string, lines: string[], priority: number) => { if (lines.length) sections.push({ title, lines, priority }); };
  const imp = (n: GraphNode) => n.importance ?? 0.3;

  // organisations and ownership
  const orgLines: string[] = [];
  // an organisation with no recorded start date is listed only when the case is about it, so a bare name cannot drag in later context
  for (const n of [...aliveNodes.values()].filter((x) => x.category === "organization" && (x.temporal.validFrom !== null || focus.has(x.id))).sort((a, b) => imp(b) - imp(a))) {
    if (!usable(n, "node")) continue;
    orgLines.push(`- ${n.name}${n.subtype ? ` (${n.subtype})` : ""}${n.temporal.validFrom ? `: exists since ${when(n.temporal.validFrom, n.temporal.datePrecision)}` : ""} ${tag(n.temporal.status, n.temporal.sourceId)}`);
  }
  for (const st of [...aliveNodes.values()].filter((x) => x.category === "ownership_stake")) {
    const holder = rels.find((r) => r.type === "HOLDS_STAKE_IN" && r.to === st.id && REL_ALIVE(r.temporal, cut));
    const target = alive.find((r) => r.type === "OF" && r.from === st.id);
    if (!holder || !target || !usable(st, "node")) continue;
    const pct = st.attrs?.percent;
    orgLines.push(`- ${byId.get(holder.from)?.name} holds ${pct == null ? "a stake" : `${pct}%`} of ${byId.get(target.to)?.name} since ${when(st.temporal.validFrom, st.temporal.datePrecision)} ${tag(st.temporal.status, st.temporal.sourceId)}`);
  }
  for (const r of alive.filter((x) => x.type === "OWNS" && usable(x, "rel"))) orgLines.push(`- ${byId.get(r.from)?.name} owns ${byId.get(r.to)?.name} since ${when(r.temporal.validFrom, r.temporal.datePrecision)} ${tag(r.temporal.status, r.temporal.sourceId)}`);
  add("Organizations and ownership", orgLines, 9);

  // people and roles. Open roles say "since"; ended roles are only printed for focus people.
  const peopleLines: string[] = [];
  const people = [...aliveNodes.values()].filter((n) => n.category === "person").sort((a, b) => imp(b) - imp(a));
  for (const p of people) {
    const roles: string[] = [];
    for (const r of rels.filter((x) => x.type === "HAS_ASSIGNMENT" && x.from === p.id)) {
      const ra = byId.get(r.to);
      const at = rels.find((x) => x.type === "AT" && x.from === r.to);
      if (!ra || !at || !usable(r, "rel")) continue;
      const open = REL_ALIVE(r.temporal, cut);
      const ended = r.temporal.validTo !== null && ms(r.temporal.validTo) <= cut;
      if (!open && !(ended && focus.has(p.id))) continue;
      const title = String(ra.attrs?.title ?? ra.subtype ?? "Member");
      roles.push(open ? `${title} at ${byId.get(at.to)?.name} since ${when(r.temporal.validFrom, r.temporal.datePrecision)}` : `${title} at ${byId.get(at.to)?.name}, ${when(r.temporal.validFrom, r.temporal.datePrecision)} to ${when(r.temporal.validTo, r.temporal.datePrecision)}`);
    }
    if (roles.length) peopleLines.push(`- ${p.name}: ${roles.join("; ")} ${tag(p.temporal.status, p.temporal.sourceId)}`);
  }
  add("People and roles", peopleLines, 5);

  // teams
  const teamLines: string[] = [];
  for (const t of [...aliveNodes.values()].filter((x) => x.category === "team").sort((a, b) => imp(b) - imp(a))) {
    if (!usable(t, "node")) continue;
    const game = out(t.id, "COMPETES_IN")[0];
    const op = into(t.id, "OPERATES")[0];
    teamLines.push(`- ${t.name}${game ? ` (${byId.get(game.to)?.name})` : ""}${op ? `, operated by ${byId.get(op.from)?.name}` : ""}, since ${when(t.temporal.validFrom, t.temporal.datePrecision)} ${tag(t.temporal.status, t.temporal.sourceId)}`);
  }
  add("Teams and esports", teamLines, 6);

  // content and channels
  const contentLines: string[] = [];
  for (const n of [...aliveNodes.values()].filter((x) => x.category === "content_series" || x.category === "channel").sort((a, b) => imp(b) - imp(a))) {
    if (!usable(n, "node")) continue;
    contentLines.push(`- ${n.category === "channel" ? "Channel" : "Series"}: ${n.name}, since ${when(n.temporal.validFrom, n.temporal.datePrecision)} ${tag(n.temporal.status, n.temporal.sourceId)}`);
  }
  for (const n of [...aliveNodes.values()].filter((x) => x.category === "content_asset").sort((a, b) => imp(b) - imp(a)).slice(0, 8)) {
    if (!usable(n, "node")) continue;
    contentLines.push(`- Content: ${n.name}, published ${when(n.temporal.validFrom, n.temporal.datePrecision)} ${tag(n.temporal.status, n.temporal.sourceId)}`);
  }
  add("Content and channels", contentLines, 3);

  // campaigns, sponsors, products
  const comLines: string[] = [];
  for (const c of [...aliveNodes.values()].filter((x) => x.category === "campaign").sort((a, b) => imp(b) - imp(a))) {
    if (!usable(c, "node")) continue;
    const brand = out(c.id, "SPONSORED_BY")[0];
    comLines.push(`- Campaign: ${c.name}${brand ? `, sponsored by ${byId.get(brand.to)?.name}` : ""}, since ${when(c.temporal.validFrom, c.temporal.datePrecision)} ${tag(c.temporal.status, c.temporal.sourceId)}`);
  }
  for (const p of [...aliveNodes.values()].filter((x) => x.category === "product")) {
    if (!usable(p, "node")) continue;
    comLines.push(`- Product: ${p.name} (${p.subtype ?? "product"}), launched ${when(p.temporal.validFrom, p.temporal.datePrecision)} ${tag(p.temporal.status, p.temporal.sourceId)}`);
  }
  add("Campaigns, sponsors and products", comLines, 7);

  // events in the 24 months before the cutoff
  const evLines: string[] = [];
  const horizon = cut - 730 * 864e5;
  for (const e of [...aliveNodes.values()].filter((x) => x.category === "event" && ms(x.temporal.validFrom ?? o.asOf) >= horizon).sort((a, b) => ms(b.temporal.validFrom!) - ms(a.temporal.validFrom!)).slice(0, 14)) {
    if (!usable(e, "node")) continue;
    evLines.push(`- ${when(e.temporal.validFrom, e.temporal.datePrecision)}: ${e.name} (${e.subtype ?? "event"}) ${tag(e.temporal.status, e.temporal.sourceId)}`);
  }
  add("Recent events (24 months before the date)", evLines, 2);

  // audience and business indicators: only observations made by the cutoff, never the outcomes under test
  const metLines: string[] = [];
  for (const m of [...store.metrics].sort((a, b) => ms(b.observedAt) - ms(a.observedAt))) {
    if (ms(m.observedAt) > cut) { withheld.afterCutoff++; continue; }
    if (blind.has(m.id) || m.id.startsWith("m:bt-")) { withheld.blinded++; continue; }
    if (m.origin !== "observed" || m.status === "mock" || m.status === "simulated") { withheld.mock++; continue; }
    if (!["Followers", "Views", "Valuation", "Revenue"].includes(m.kind)) continue;
    metLines.push(`- ${m.label}: ${fmtNum(m.value)} ${m.unit.replace("USD/year", "USD per year")}, observed ${when(m.observedAt)} ${tag(m.status, m.sourceId)}`);
  }
  add("Audience and business indicators known by then", metLines.slice(0, 12), 8);

  // audience segments: names only, no stated preferences, so the simulation has groups of people without being told what they pick
  if (o.includeAudienceSegments !== false) {
    const seg = [...aliveNodes.values()].filter((n) => n.category === "audience_cohort").map((n) => `- ${n.name}`);
    if (seg.length) add("Audience segments (analyst-defined, not measured; no preferences stated)", seg, 4);
  }
  if (o.includeInferred) {
    const nar = [...aliveNodes.values()].filter((n) => n.category === "narrative").map((n) => `- ${n.name} [inferred]`);
    add("Narratives in the community (inferred)", nar, 1);
  }

  const known = (o.knownAtT0 ?? []).map((k) => `- ${k.label}: ${String(k.value)}`);
  const briefs = (o.briefs ?? []).map((b) => `### ${b.label}\n${b.text}\n(source: ${b.sourceIds.map((s) => src.get(s)?.publisher ?? s).join(", ") || "not given"})`);

  // fit the size budget by dropping lowest-priority lines first
  const max = o.maxChars ?? 9000;
  const render = () => {
    const head = `# ${o.title}\nThis document states what was known on ${when(o.asOf)}. Every line carries its status and source. Nothing after that date is included.\n`;
    const body = sections.map((s) => `\n## ${s.title}\n${s.lines.join("\n")}`).join("");
    const k = known.length ? `\n\n## Known on that date\n${known.join("\n")}` : "";
    const b = briefs.length ? `\n\n## The announcement${briefs.length > 1 ? "s" : ""}\n${briefs.join("\n\n")}` : "";
    return head + body + k + b + "\n";
  };
  let text = render(), trimmed = 0;
  const order = [...sections].sort((a, c) => a.priority - c.priority);
  for (const s of order) { while (text.length > max && s.lines.length > 1) { s.lines.pop(); trimmed++; text = render(); } }
  if (trimmed) text += `(${trimmed} lower-priority lines were trimmed to fit the size budget.)\n`;

  let masked = false;
  const allPeople = store.nodes.filter((n) => n.category === "person");
  if (o.mask) { text = maskText(text, o.mask, allPeople); masked = true; }

  const hits = leakCheck(text, o, cut, allPeople);
  const manifest: DossierManifest = {
    asOf: o.asOf, snapshotId: `snapshot-${o.asOf.slice(0, 10)}`, chars: text.length,
    factCount: sections.reduce((n, s) => n + s.lines.length, 0) + known.length,
    sections: Object.fromEntries(sections.map((s) => [s.title, s.lines.length])), withheld, masked,
    placeholders: o.placeholders ?? [], leakCheck: { passed: hits.length === 0, hits },
  };
  return { text, manifest };
}

const fmtNum = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)} million` : n.toLocaleString("en"));

export function maskText(text: string, mask: NonNullable<DossierOptions["mask"]>, people: GraphNode[]): string {
  let t = text;
  for (const [from, to] of mask.terms) t = t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
  // creators -> stable aliases, longest names first so "FaZe Banks" is replaced before "Banks"
  const labels: [string, string][] = [];
  [...people].sort((a, b) => a.id.localeCompare(b.id)).forEach((p, i) => [p.name, ...p.aliases].forEach((a) => labels.push([a, `Creator ${i + 1}`])));
  labels.sort((a, b) => b[0].length - a[0].length);
  for (const [name, alias] of labels) {
    if (name.length < 3) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, name.length <= 4 ? "g" : "gi"), alias);
  }
  return t.replace(/@?#?FaZe(\s?Clan)?/gi, (m) => (m.startsWith("@") ? "@" : m.startsWith("#") ? "#" : "") + mask.orgAlias);
}

export function leakCheck(text: string, o: DossierOptions, cut: number, people: GraphNode[]): string[] {
  const hits: string[] = [];
  if (o.mask) {
    if (/faze/i.test(text)) hits.push("the organisation name is still present");
    for (const p of people) for (const a of [p.name, ...p.aliases]) if (a.length >= 5 && !/^creator \d+$/i.test(a) && new RegExp(`(?<![\\w])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`).test(text)) hits.push(`creator name still present: ${a}`);
  } else {
    const cutYear = new Date(cut).getUTCFullYear();
    for (const m of text.matchAll(/\b(20[1-3]\d)\b/g)) if (Number(m[1]) > cutYear) hits.push(`later year mentioned: ${m[1]}`);
  }
  for (const f of o.forbiddenTerms ?? []) if (f && text.toLowerCase().includes(f.toLowerCase())) hits.push(`withheld outcome appears: ${f}`);
  return [...new Set(hits)].slice(0, 12);
}
