import type { BacktestCase, BacktestOutcome, RankingPair } from "../types";
import { SeedBuilder } from "./builder";

/**
 * Design Chapter 18 case library. Only numbers and links that the design document gives are used.
 * Anything it does not give (exact T0 days, archive URLs, capture dates, audience sizes for B1) is null and listed in
 * `placeholders` (requirement A-20), and the scorecard shows that.
 *
 * Leak control: outcome metrics are dated at the date the result became final, never at T0, so a dossier cut at T0 cannot
 * contain them. Where the source gives no T0 day, the cutoff is the day before the stated month starts (the conservative side).
 */
const OUT_PROV = { organizer: "organizer_reported", third: "third_party" } as const;

export function seedBacktestEntities(b: SeedBuilder): void {
  // outside creators and the platform. Same Person model: one canonical node each.
  b.node("org:twitch", "organization", "Twitch", { subtype: "Platform", src: "src-design-ch18", imp: .5 });
  b.node("person:ironmouse", "person", "Ironmouse", { subtype: "Person", aliases: [], src: "src-design-ch18", imp: .4, summary: "Outside comparable (VTuber)." });
  b.node("person:kai-cenat", "person", "Kai Cenat", { subtype: "Person", aliases: ["Kai"], src: "src-design-ch18", imp: .4, summary: "Outside comparable (Twitch streamer)." });
  b.node("person:ludwig", "person", "Ludwig", { subtype: "Person", aliases: [], src: "src-design-ch18", imp: .4, summary: "Outside comparable (creator-run events)." });

  // FaZe5 2020 (the FaZe1 campaign node and the 2024/2025 subathon nodes already exist in events-content)
  b.node("camp:faze5-2020", "campaign", "FaZe5 recruitment challenge (2020)", { subtype: "RecruitmentChallenge", from: "2020-09-04", to: "2020-12-31", src: "bt-afkgaming", imp: .6, summary: "Open call to every kind of creator. Registration 4–18 Sep 2020." });
  b.rel("PART_OF_SERIES", "camp:faze5-2020", "series:faze5", { from: "2020-09-04", src: "bt-afkgaming" });
  b.rel("PART_OF_SERIES", "camp:faze5-2020", "series:recruitment", { from: "2020-09-04", src: "bt-afkgaming" });
  b.rel("SPONSORED_BY", "camp:faze5-2020", "brand:gfuel", { from: "2020-09-04", src: "bt-sportskeeda-faze5" });
  b.rel("SPONSORED_BY", "camp:faze5-2020", "brand:nissan", { from: "2020-09-04", src: "bt-sportskeeda-faze5" });
  b.rel("PARTICIPATED_IN", "org:faze-clan", "camp:faze5-2020", { from: "2020-09-04", to: "2020-12-31", src: "bt-afkgaming" });
  b.rel("PARTICIPATED_IN", "person:scope", "camp:faze5-2020", { from: "2020-12-27", src: "bt-prn-faze5", note: "The sixth winner, added on 31 Dec 2020." });
  b.rel("FOLLOWED_BY", "camp:faze5-2020", "camp:faze1", { from: "2022-01-20", src: "src-design-ch18", note: "Walk-forward comparable. Chronology only." });
  b.node("ev:faze5-2020-winners", "event", "FaZe5 2020 winners named (six, not five)", { subtype: "Signing", from: "2020-12-27", src: "bt-prn-faze5", summary: "Winners named 27–31 Dec 2020." });
  b.rel("PRECEDED", "camp:faze5-2020", "ev:faze5-2020-winners", { from: "2020-12-27", src: "bt-prn-faze5" });
  b.node("ev:faze1-announced", "event", "FaZe1 announced; registration closes 9 Feb 2022", { subtype: "ProductLaunch", from: "2022-01-20", src: "bt-faze-ir-faze1-announce" });
  b.rel("PRECEDED", "ev:faze1-announced", "camp:faze1", { from: "2022-05-05", src: "bt-faze-ir-faze1-announce" });
  b.node("ev:faze1-covid-pause", "event", "FaZe1 paused for COVID cases, resumes; winner named 26 May", { subtype: "Controversy", from: "2022-05-11", src: "bt-ggrecon", conf: .8, status: "reported", note: "About six days in; resumed and named a winner on 26 May.", prec: "month" });
  b.rel("AFFECTED", "ev:faze1-covid-pause", "camp:faze1", { from: "2022-05-11", src: "bt-ggrecon", status: "reported", conf: .8 });
  b.rel("PRECEDED", "ev:rug-meetup-police", "ev:faze1-announced", { from: "2022-01-20", src: "src-inference", status: "inferred", conf: .3, note: "Chronology only." });

  // comparable events outside FaZe
  const camp = (id: string, name: string, by: string, from: string, src: string, summary: string, prec?: "month" | "year") =>
    b.node(`camp:${id}`, "campaign", name, { subtype: "CreatorEvent", from, src, prec, imp: .5, summary });
  camp("ironmouse-subathon-2024", "Ironmouse charity subathon (Sept 2024)", "person:ironmouse", "2024-09", "bt-streamscharts-ironmouse", "Ran in the same month as FaZe's first subathon, under the same SUBtember discounts.");
  camp("mafiathon-2-2024", "Kai Cenat's Mafiathon 2 (Oct 2024)", "person:kai-cenat", "2024-10", "bt-streamscharts-kai", "Outside comparable.");
  camp("mafiathon-3-2025", "Kai Cenat's Mafiathon 3 (Sept 2025)", "person:kai-cenat", "2025-09", "bt-streamscharts-kai", "Ran during SUBtember 2025.");
  camp("streamer-games-2024", "Ludwig's Streamer Games (2024)", "person:ludwig", "2024", "bt-netinfluencer", "Creator-run event.", "year");
  camp("streamer-games-2025", "Ludwig's Streamer Games (Aug 2025)", "person:ludwig", "2025-08", "bt-netinfluencer", "Creator-run event.", "month");
  for (const [p, c] of [["ironmouse", "ironmouse-subathon-2024"], ["kai-cenat", "mafiathon-2-2024"], ["kai-cenat", "mafiathon-3-2025"], ["ludwig", "streamer-games-2024"], ["ludwig", "streamer-games-2025"]] as const) {
    const n = b.nodes.find((x) => x.id === `camp:${c}`)!;
    b.rel("CREATED", `person:${p}`, `camp:${c}`, { from: n.temporal.validFrom!.slice(0, 10), src: n.temporal.sourceId, prec: n.temporal.datePrecision });
    b.rel("PUBLISHED_ON", `camp:${c}`, "org:twitch", { from: n.temporal.validFrom!.slice(0, 10), src: n.temporal.sourceId, prec: n.temporal.datePrecision, conf: .7, status: "reported", note: "Platform inferred from the sub and viewer metrics." });
  }
  b.rel("PRECEDED", "camp:mafiathon-2-2024", "camp:mafiathon-3-2025", { from: "2025-09", src: "src-design-ch18" });
  b.rel("PRECEDED", "camp:streamer-games-2024", "camp:streamer-games-2025", { from: "2025-08", src: "src-design-ch18" });
  b.rel("PRECEDED", "camp:subathon-2024", "camp:subathon-2", { from: "2025-10", src: "src-design-ch18" });
  b.node("narr:subtember", "narrative", "Twitch SUBtember discounts", { from: "2024-09", src: "bt-streamhatchet", imp: .4, summary: "Platform-wide discounts that lifted subscriptions 21% in their first days (2024)." });
  for (const c of ["subathon-2024", "ironmouse-subathon-2024", "mafiathon-3-2025"]) b.rel("AFFECTED", "narr:subtember", `camp:${c}`, { from: c === "mafiathon-3-2025" ? "2025-09" : "2024-09", src: "bt-streamhatchet", conf: .8, status: "reported", note: "Known at T0; the discount is a platform-wide factor, not a causal claim." });

  // outcomes (observed at the date the result was final, which is after every T0)
  const M = (id: string, kind: Parameters<SeedBuilder["metric"]>[1], label: string, subject: string, value: number, unit: string, at: string, src: string) =>
    b.metric(`m:bt-${id}`, kind, label, subject, value, unit, at, src, "reported", "Backtest outcome. Withheld from any dossier cut before this date.");
  M("faze5-apps", "Entries", "FaZe5 2020: applications (lower bound)", "camp:faze5-2020", 211000, "applications", "2020-12-31", "bt-hype-faze5");
  M("faze5-views", "Views", "FaZe5 2020: combined views in the 30-day challenge (lower bound)", "camp:faze5-2020", 35000000, "views", "2020-12-31", "bt-hype-faze5");
  M("faze1-uniq", "Viewers", "FaZe1: unique finale-show viewers (lower bound)", "camp:faze1", 600000, "unique viewers", "2022-05-26", "bt-faze-ir-faze1-winner");
  M("faze1-impr", "Views", "FaZe1: impressions (lower bound)", "camp:faze1", 42000000, "impressions", "2022-05-26", "bt-faze-ir-faze1-winner");
  M("faze1-avg", "Viewers", "FaZe1: average viewers over the first 130 hours", "camp:faze1", 2800, "average viewers", "2022-05-15", "bt-mein-mmo");
  M("sub24-subs", "SubscriberChange", "Subathon 2024: new Twitch subs (lower bound)", "camp:subathon-2024", 300000, "new subs", "2024-09-30", "bt-gs-subathon");
  M("sub24-followers", "Followers", "Subathon 2024: new followers (lower bound)", "camp:subathon-2024", 710000, "new followers", "2024-09-30", "bt-gs-subathon");
  M("sub24-avg", "Viewers", "Subathon 2024: average concurrent viewers", "camp:subathon-2024", 52600, "average concurrent", "2024-09-30", "bt-gs-subathon");
  M("sub24-peak", "Viewers", "Subathon 2024: peak concurrent viewers", "camp:subathon-2024", 132200, "peak concurrent", "2024-09-30", "bt-gs-subathon");
  M("sub24-minutes", "WatchTime", "Subathon 2024: minutes watched", "camp:subathon-2024", 2200000000, "minutes", "2024-09-30", "bt-gs-subathon");
  M("sub24-jason", "SubscriberChange", "Subathon 2024: JasonTheWeen subs added", "camp:subathon-2024", 99500, "subs", "2024-09-30", "bt-streamhatchet");
  M("sub25-jason", "SubscriberChange", "Subathon II: JasonTheWeen subs by day nine (lower bound)", "camp:subathon-2", 100000, "subs", "2025-10-18", "bt-wingg");
  M("sub25-adapt", "SubscriberChange", "Subathon II: Adapt subs (passed 50K, later 100K)", "camp:subathon-2", 50000, "subs", "2025-10-18", "bt-wingg");
  M("sub25-top10", "Engagement", "Subathon II: FaZe creators in Twitch's top 10 by subs (18 Oct)", "camp:subathon-2", 5, "creators", "2025-10-18", "bt-wingg");
  M("iron-subs", "SubscriberChange", "Ironmouse charity subathon: active subs (record)", "camp:ironmouse-subathon-2024", 320478, "active subs", "2024-09-30", "bt-streamscharts-ironmouse");
  M("maf2-peak", "SubscriberChange", "Mafiathon 2: peak active subs", "camp:mafiathon-2-2024", 728525, "active subs", "2024-10-31", "bt-streamscharts-kai");
  M("maf3-peak", "SubscriberChange", "Mafiathon 3: peak active subs (first past 1M, 28 Sep 2025; lower bound)", "camp:mafiathon-3-2025", 1000000, "active subs", "2025-09-28", "bt-streamscharts-kai");
  M("sg24-peak", "Viewers", "Streamer Games 2024: peak concurrent viewers", "camp:streamer-games-2024", 175500, "peak concurrent", "2024-12-31", "bt-netinfluencer");
  M("sg25-peak", "Viewers", "Streamer Games 2025: peak concurrent viewers (lower bound)", "camp:streamer-games-2025", 330000, "peak concurrent", "2025-08-31", "bt-netinfluencer");
}

const PLACEHOLDER_COMMON = ["Archive URL of the brief", "Capture date of each outcome", "Audience sizes (followers, average viewers) at this T0 and at the previous T0, needed for baseline B1"];
const noArchive = null;

const out = (id: string, metric: string, label: string, value: number | null, bound: "exact" | "lower", unit: string, sourceIds: string[],
  provenance: BacktestOutcome["provenance"], o: { shock?: boolean; node?: string | null; note?: string; scorable?: boolean } = {}): BacktestOutcome =>
  ({ id, metric, label, value, bound, unit, sourceIds, provenance, shock: o.shock ?? false, scorable: o.scorable ?? value !== null, metricNodeId: o.node === undefined ? (value === null ? null : `m:bt-${id}`) : o.node, archiveUrl: noArchive, capturedAt: null, note: o.note });

const baseTerms: [string, string][] = [];

export const BACKTEST_CASES: BacktestCase[] = [
  {
    id: "faze5-2020", title: "#FaZe5 recruitment challenge, 2020", family: "recruitment", split: "holdout",
    t0: null, t0Cutoff: "2020-09-03T00:00:00Z", t0Status: "derived", resolvesAt: "2020-12-31T00:00:00Z", subjectNodeId: "camp:faze5-2020",
    brief: { text: "An open call to every kind of creator, gamers and non-gamers. Five spots will be awarded. Each winner gets $20,000, and a G FUEL deal. The first winner also gets a Nissan. Registration runs 4–18 September 2020.", sourceIds: ["bt-afkgaming", "bt-sportskeeda-faze5"], archiveUrl: null, note: "Summarised from the design document's table. The published text is not in the source." },
    entities: ["org:faze-clan", "series:faze5", "series:recruitment", "brand:gfuel", "brand:nissan"],
    knownAtT0: [], questions: [
      { metric: "applications", label: "Applications", unit: "applications", window: "registration to close", shock: false },
      { metric: "views", label: "Views of #FaZe5 content", unit: "views", window: "during the challenge", shock: false }],
    outcomes: [
      out("faze5-apps", "applications", "Applications (211,000+)", 211000, "lower", "applications", ["bt-hype-faze5"], OUT_PROV.organizer),
      out("faze5-views", "views", "Combined views in the 30-day challenge (35M+)", 35000000, "lower", "views", ["bt-hype-faze5"], OUT_PROV.organizer),
    ],
    baseline: { rule: "B0 = the last comparable event's number. No earlier FaZe5 application count is in the source.", b0: null, b0Label: null, b1: null, missing: ["B0: application count of an earlier comparable event"] },
    masking: { terms: baseTerms }, placeholders: ["Exact T0 day: the source gives the registration window (4–18 Sep 2020) but not the day FaZe would have run the scrim. Cutoff set to 3 Sep 2020.", ...PLACEHOLDER_COMMON], lockedForecastSha256: null,
  },
  {
    id: "faze1-2022", title: "FaZe1, 2022", family: "recruitment", split: "holdout",
    t0: "2022-01-19T00:00:00Z", t0Cutoff: "2022-01-19T00:00:00Z", t0Status: "stated", resolvesAt: "2022-05-26T00:00:00Z", subjectNodeId: "camp:faze1",
    brief: { text: "One spot. The winner gets $1 million in crypto from MoonPay, a $250,000 sponsorship and a Nissan GT-R. The top 20 finalists live on stream 24/7 in The Warehouse. Registration closes 9 February 2022.", sourceIds: ["bt-faze-ir-faze1-announce", "bt-ginx-faze1"], archiveUrl: null, note: "Announced 20 January 2022. Summarised from the design document's table." },
    entities: ["org:faze-clan", "series:recruitment", "brand:nissan", "camp:faze5-2020"],
    knownAtT0: [], questions: [
      { metric: "submissions", label: "Submissions", unit: "submissions", window: "registration to 9 Feb 2022", shock: false },
      { metric: "unique-viewers", label: "Unique viewers of the finale show", unit: "unique viewers", window: "finale", shock: true }],
    outcomes: [
      out("faze1-subs", "submissions", "Submissions (“thousands”, no exact count published)", null, "exact", "submissions", ["bt-faze-ir-faze1-winner"], OUT_PROV.organizer, { scorable: false, node: null, note: "Unscorable: the source gives no number. Submissions had closed in February, so the COVID pause does not shock this metric." }),
      out("faze1-uniq", "unique-viewers", "Unique viewers (600,000+)", 600000, "lower", "unique viewers", ["bt-faze-ir-faze1-winner"], OUT_PROV.organizer, { shock: true, note: "Shock: COVID cases paused The Warehouse about six days in." }),
      out("faze1-impr", "impressions", "Impressions (42M+)", 42000000, "lower", "impressions", ["bt-faze-ir-faze1-winner"], OUT_PROV.organizer, { shock: true }),
      out("faze1-avg", "average-viewers", "Average viewers over the first 130 hours (about 2,800)", 2800, "exact", "average viewers", ["bt-mein-mmo"], OUT_PROV.third, { shock: true }),
    ],
    baseline: { rule: "B0 = FaZe5 2020's application count, the last comparable event. B1 scales it by audience growth between the two T0s.", b0: 211000, b0Label: "FaZe5 2020 applications (211,000+)", b1: null, missing: ["Audience size at both T0s, needed to scale B0 into B1"] },
    masking: { terms: baseTerms }, placeholders: ["Archive URL of the brief", "Capture date of each outcome", "Audience sizes at both T0s (B1)"], lockedForecastSha256: null,
  },
  {
    id: "faze-subathon-2024", title: "FaZe Subathon, September 2024", family: "subathon", split: "holdout",
    t0: "2024-08-30T00:00:00Z", t0Cutoff: "2024-08-30T00:00:00Z", t0Status: "stated", resolvesAt: "2024-09-30T00:00:00Z", subjectNodeId: "camp:subathon-2024",
    brief: { text: "Six creators go live all month, each with their own sub timer. FaZe announces it on 31 August 2024.", sourceIds: ["bt-bcit-post"], archiveUrl: null },
    entities: ["org:faze-media", "series:subathon", "brand:gfuel", "org:twitch"],
    knownAtT0: [{ key: "twitch_subtember_discount", label: "Twitch SUBtember discounts are running (they lifted subscriptions 21% in their first days)", value: true, sourceIds: ["bt-streamhatchet"] }],
    questions: [
      { metric: "new-subs", label: "New Twitch subs", unit: "subs", window: "the month", shock: false },
      { metric: "avg-viewers", label: "Average concurrent viewers", unit: "viewers", window: "the month", shock: false },
      { metric: "peak-viewers", label: "Peak concurrent viewers", unit: "viewers", window: "the month", shock: false }],
    outcomes: [
      out("sub24-subs", "new-subs", "New Twitch subs (300K+)", 300000, "lower", "new subs", ["bt-gs-subathon"], OUT_PROV.organizer),
      out("sub24-followers", "new-followers", "New followers (710K+)", 710000, "lower", "new followers", ["bt-gs-subathon"], OUT_PROV.organizer),
      out("sub24-avg", "avg-viewers", "Average concurrent viewers (52.6K)", 52600, "exact", "viewers", ["bt-gs-subathon"], OUT_PROV.organizer),
      out("sub24-peak", "peak-viewers", "Peak concurrent viewers (132.2K)", 132200, "exact", "viewers", ["bt-gs-subathon"], OUT_PROV.organizer),
      out("sub24-minutes", "minutes-watched", "Minutes watched (2.2B)", 2200000000, "exact", "minutes", ["bt-gs-subathon"], OUT_PROV.organizer),
      out("sub24-jason", "creator-subs", "JasonTheWeen subs added (99.5K)", 99500, "exact", "subs", ["bt-streamhatchet"], OUT_PROV.third),
    ],
    baseline: { rule: "B0 = the last comparable event. FaZe-only baselines are thin: this is the first event after the April 2024 reboot.", b0: null, b0Label: null, b1: null, missing: ["B0: no earlier comparable FaZe subathon"] },
    masking: { terms: baseTerms }, placeholders: ["Archive URL of the brief", "Capture date of each outcome", "Audience sizes at this T0 (B1)"], lockedForecastSha256: null,
  },
  {
    id: "faze-subathon-ii-2025", title: "FaZe Subathon II, October 2025", family: "subathon", split: "holdout",
    t0: "2025-09-30T00:00:00Z", t0Cutoff: "2025-09-30T00:00:00Z", t0Status: "stated", resolvesAt: "2025-10-18T00:00:00Z", subjectNodeId: "camp:subathon-2",
    brief: { text: "The same month-long subathon format as 2024. Members say they will clock out at night rather than stay on camera 24/7.", sourceIds: ["bt-sportskeeda-sub2"], archiveUrl: null },
    entities: ["org:faze-media", "series:subathon", "camp:subathon-2024"],
    knownAtT0: [
      { key: "twitch_subtember_discount", label: "No SUBtember discount in October", value: false, sourceIds: ["bt-streamhatchet"] },
      { key: "stable_ronaldo_may_sit_out", label: "Stable Ronaldo has hinted he might sit it out", value: true, sourceIds: ["bt-wingg"] }],
    questions: [
      { metric: "new-subs", label: "New subs", unit: "subs", window: "the month", shock: false },
      { metric: "top10", label: "FaZe creators in Twitch's top 10 by subs", unit: "creators", window: "by 18 Oct", shock: false }],
    outcomes: [
      out("sub25-jason", "creator-subs", "JasonTheWeen reached 100K subs in nine days", 100000, "lower", "subs", ["bt-wingg"], OUT_PROV.third, { note: "Vendor and press figure, not an official total." }),
      out("sub25-adapt", "creator-subs", "Adapt passed 50K subs (later 100K)", 50000, "lower", "subs", ["bt-wingg"], OUT_PROV.third),
      out("sub25-top10", "top10", "Five FaZe creators in the top 10 by 18 Oct", 5, "exact", "creators", ["bt-wingg"], OUT_PROV.third),
      out("sub25-total", "new-subs", "Team total new subs (no official total found)", null, "exact", "subs", ["bt-wingg"], OUT_PROV.third, { scorable: false, node: null, note: "Unscorable: no official totals were found." }),
    ],
    baseline: { rule: "B0 = Subathon 2024's new subs (300K+), the last comparable event.", b0: 300000, b0Label: "Subathon 2024 new subs (300K+)", b1: null, missing: ["Audience sizes at both T0s (B1)"] },
    masking: { terms: baseTerms }, placeholders: PLACEHOLDER_COMMON, lockedForecastSha256: null,
  },
  {
    id: "fazemas-2025", title: "FaZemas, December 2025 (shock case)", family: "subathon", split: "holdout",
    t0: null, t0Cutoff: "2025-11-30T00:00:00Z", t0Status: "placeholder", resolvesAt: "2025-12-26T00:00:00Z", subjectNodeId: "ev:exodus-1",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives no brief for the holiday subathon." },
    entities: ["org:faze-media", "series:subathon"],
    knownAtT0: [], questions: [{ metric: "none", label: "Nothing scored", unit: "", window: "", shock: true }],
    outcomes: [out("fazemas-ended", "ended-abruptly", "The subathon ended abruptly; five creators posted “Left @FaZeClan” on 25–26 Dec", null, "exact", "", ["bt-tribune", "bt-ibtimes"], OUT_PROV.third, { shock: true, scorable: false, node: null, note: "Kept to prove the shock rule and its labels work." })],
    baseline: { rule: "Nothing scored.", b0: null, b0Label: null, b1: null, missing: [] },
    masking: { terms: baseTerms }, placeholders: ["T0 day: the source gives only 'the holiday subathon'. Cutoff set to 30 Nov 2025 so nothing from December leaks.", "Brief text"], lockedForecastSha256: null,
  },
  {
    id: "ironmouse-subathon-2024", title: "Ironmouse's charity subathon, September 2024", family: "subathon", split: "holdout",
    t0: null, t0Cutoff: "2024-08-31T00:00:00Z", t0Status: "derived", resolvesAt: "2024-09-30T00:00:00Z", subjectNodeId: "camp:ironmouse-subathon-2024",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives only 'the day before it started'." },
    entities: ["person:ironmouse", "org:twitch", "narr:subtember"],
    knownAtT0: [{ key: "twitch_subtember_discount", label: "Twitch SUBtember discounts apply", value: true, sourceIds: ["bt-streamhatchet"] }],
    questions: [{ metric: "new-subs", label: "New subs", unit: "subs", window: "the event", shock: false }],
    outcomes: [out("iron-subs", "new-subs", "A record 320,478 active subs", 320478, "exact", "active subs", ["bt-streamscharts-ironmouse"], OUT_PROV.third)],
    baseline: { rule: "B0 = the last comparable event.", b0: null, b0Label: null, b1: null, missing: ["B0: no earlier comparable event in the source"] },
    masking: { terms: baseTerms }, placeholders: ["T0 day and the brief (the source says 'the day before it started'). Cutoff set to 31 Aug 2024.", "Archive URL", "Audience sizes"], lockedForecastSha256: null,
  },
  {
    id: "mafiathon-2-2024", title: "Kai Cenat's Mafiathon 2, October 2024", family: "subathon", split: "holdout",
    t0: null, t0Cutoff: "2024-09-30T00:00:00Z", t0Status: "derived", resolvesAt: "2024-10-31T00:00:00Z", subjectNodeId: "camp:mafiathon-2-2024",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives only 'the day before it started'." },
    entities: ["person:kai-cenat", "org:twitch"],
    knownAtT0: [{ key: "twitch_subtember_discount", label: "No SUBtember discount (it ran in October)", value: false, sourceIds: ["src-design-ch18"] }],
    questions: [{ metric: "peak-active-subs", label: "Peak active subs", unit: "active subs", window: "the event", shock: false }],
    outcomes: [out("maf2-peak", "peak-active-subs", "728,525 at the peak", 728525, "exact", "active subs", ["bt-streamscharts-kai"], OUT_PROV.third)],
    baseline: { rule: "B0 = the last comparable event.", b0: null, b0Label: null, b1: null, missing: ["B0: no earlier comparable event in the source"] },
    masking: { terms: baseTerms }, placeholders: ["T0 day and the brief. Cutoff set to 30 Sep 2024.", "Archive URL", "Audience sizes"], lockedForecastSha256: null,
  },
  {
    id: "mafiathon-3-2025", title: "Kai Cenat's Mafiathon 3, September 2025", family: "subathon", split: "holdout",
    t0: null, t0Cutoff: "2025-08-31T00:00:00Z", t0Status: "derived", resolvesAt: "2025-09-28T00:00:00Z", subjectNodeId: "camp:mafiathon-3-2025",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives only 'the day before it started'." },
    entities: ["person:kai-cenat", "org:twitch", "camp:mafiathon-2-2024", "narr:subtember"],
    knownAtT0: [{ key: "twitch_subtember_discount", label: "SUBtember 2025 discounts apply (only the second Mafiathon ran during SUBtember)", value: true, sourceIds: ["bt-gs-q3-2025"] }],
    questions: [{ metric: "peak-active-subs", label: "Peak active subs", unit: "active subs", window: "the event", shock: false }],
    outcomes: [out("maf3-peak", "peak-active-subs", "First Twitch streamer past 1 million (28 Sep 2025)", 1000000, "lower", "active subs", ["bt-streamscharts-kai"], OUT_PROV.third, { note: "Mafiathon 3 drew 71% of all SUBtember 2025 subs (GameSquare)." })],
    baseline: { rule: "B0 = Mafiathon 2's peak (728,525), the last comparable event.", b0: 728525, b0Label: "Mafiathon 2 peak active subs", b1: null, missing: ["Audience sizes at both T0s (B1)"] },
    masking: { terms: baseTerms }, placeholders: ["T0 day and the brief. Cutoff set to 31 Aug 2025.", "Archive URL", "Audience sizes"], lockedForecastSha256: null,
  },
  {
    id: "streamer-games-2024", title: "Ludwig's Streamer Games, 2024", family: "creator_event", split: "holdout",
    t0: null, t0Cutoff: "2023-12-31T00:00:00Z", t0Status: "placeholder", resolvesAt: "2024-12-31T00:00:00Z", subjectNodeId: "camp:streamer-games-2024",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives only 'the day before the event'." },
    entities: ["person:ludwig", "org:twitch"],
    knownAtT0: [], questions: [{ metric: "peak-concurrent", label: "Peak concurrent viewers", unit: "viewers", window: "the event", shock: false }],
    outcomes: [out("sg24-peak", "peak-concurrent", "175,500", 175500, "exact", "viewers", ["bt-netinfluencer"], OUT_PROV.third)],
    baseline: { rule: "B0 = the last comparable event.", b0: null, b0Label: null, b1: null, missing: ["B0: no earlier comparable event in the source"] },
    masking: { terms: baseTerms }, placeholders: ["The event's date is not in the source. Cutoff set to 31 Dec 2023 so nothing from 2024 leaks.", "The brief", "Audience sizes"], lockedForecastSha256: null,
  },
  {
    id: "streamer-games-2025", title: "Ludwig's Streamer Games, August 2025", family: "creator_event", split: "holdout",
    t0: null, t0Cutoff: "2025-07-31T00:00:00Z", t0Status: "derived", resolvesAt: "2025-08-31T00:00:00Z", subjectNodeId: "camp:streamer-games-2025",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "The source gives only 'the day before the event'." },
    entities: ["person:ludwig", "org:twitch", "camp:streamer-games-2024"],
    knownAtT0: [], questions: [{ metric: "peak-concurrent", label: "Peak concurrent viewers", unit: "viewers", window: "the event", shock: false }],
    outcomes: [out("sg25-peak", "peak-concurrent", "330,000+", 330000, "lower", "viewers", ["bt-netinfluencer"], OUT_PROV.third)],
    baseline: { rule: "B0 = the 2024 peak (175,500), the last comparable event.", b0: 175500, b0Label: "Streamer Games 2024 peak", b1: null, missing: ["Audience sizes at both T0s (B1)"] },
    masking: { terms: baseTerms }, placeholders: ["T0 day and the brief. Cutoff set to 31 Jul 2025.", "Audience sizes"], lockedForecastSha256: null,
  },
  {
    id: "homecoming-week2-2026", title: "Homecoming week 2 (prospective draft)", family: "drop", split: "prospective",
    t0: null, t0Cutoff: "2026-11-15T00:00:00Z", t0Status: "placeholder", resolvesAt: null, subjectNodeId: "org:faze-media",
    brief: { text: null, sourceIds: [], archiveUrl: null, note: "Prospective: the forecast is locked with a SHA-256 hash before the event starts." },
    entities: ["org:faze-media"], knownAtT0: [], questions: [{ metric: "entrants", label: "Entrants", unit: "entrants", window: "the week", shock: false }],
    outcomes: [], baseline: { rule: "Set before the run.", b0: null, b0Label: null, b1: null, missing: ["Everything: the event has not happened"] },
    masking: { terms: baseTerms }, placeholders: ["T0, brief, baseline: set when the drop is announced"], lockedForecastSha256: null,
  },
];

export const RANKING_PAIRS: RankingPair[] = [
  { id: "pair-faze5-vs-faze1", title: "#FaZe5 (2020) vs FaZe1 (2022): entries", metric: "entries", earlierCaseId: "faze5-2020", laterCaseId: "faze1-2022",
    actualWinnerCaseId: "faze5-2020", baselineRule: "later edition wins", runnable: true,
    evidence: "#FaZe5 drew 211,000+ applications. FaZe1 drew “thousands”, with a signing bonus 50 times larger ($1M against $20K). A model that only reads prize size gets it backwards, and so does the sequel baseline." },
  { id: "pair-mafiathon-2-vs-3", title: "Mafiathon 2 vs 3: peak active subs", metric: "peak-active-subs", earlierCaseId: "mafiathon-2-2024", laterCaseId: "mafiathon-3-2025",
    actualWinnerCaseId: "mafiathon-3-2025", baselineRule: "later edition wins", runnable: false,
    evidence: "Mafiathon 3 went past 1 million against 728,525. Not runnable as a pair: neither brief is in the source." },
  { id: "pair-streamer-games", title: "Streamer Games 2024 vs 2025: peak concurrent viewers", metric: "peak-concurrent", earlierCaseId: "streamer-games-2024", laterCaseId: "streamer-games-2025",
    actualWinnerCaseId: "streamer-games-2025", baselineRule: "later edition wins", runnable: false,
    evidence: "330,000+ against 175,500. Not runnable as a pair: neither brief is in the source." },
  { id: "pair-subathon-2024-vs-2025", title: "FaZe Subathon 2024 vs 2025: new subs", metric: "new-subs", earlierCaseId: "faze-subathon-2024", laterCaseId: "faze-subathon-ii-2025",
    actualWinnerCaseId: null, baselineRule: "later edition wins", runnable: false,
    evidence: "Waiting on vendor totals. The source has no official 2025 total, so this pair cannot be scored." },
];
