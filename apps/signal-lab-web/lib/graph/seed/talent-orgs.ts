import { SeedBuilder } from "./builder";

const T = "src-timeline";
const GS = "gamesquare-release-2024-05-16";

/** Organizations, teams, games, people, role assignments and ownership. Every date comes from the timeline. */
export function seedTalentAndOrgs(b: SeedBuilder): void {
  // ---------------------------------------------------------------- organizations
  b.node("org:faze-clan", "organization", "FaZe Clan", { subtype: "Organization", aliases: ["FaZe Sniping", "FaZe"], from: "2010-05", src: "src-wikipedia", imp: 1, summary: "Founded as FaZe Sniping in May 2010." });
  b.node("org:faze-holdings", "organization", "FaZe Holdings (Nasdaq: FAZE)", { subtype: "PublicCompany", aliases: ["FAZE", "FaZe Holdings Inc."], from: "2022-07-19", to: "2024-03-08", src: "src-wikipedia", summary: "Listed via SPAC at a $725M valuation; delisted when GameSquare closed the acquisition." });
  b.node("org:faze-media", "organization", "FaZe Media", { subtype: "BusinessUnit", from: "2024-05-16", src: GS, imp: .9, summary: "Creator and content business formed by GameSquare on 16 May 2024." });
  b.node("org:faze-esports", "organization", "FaZe Esports", { subtype: "BusinessUnit", aliases: ["FaZe Esports (GameSquare)"], from: "2024-05-16", src: GS, imp: .9, summary: "Esports competition assets, wholly owned by GameSquare. Renamed and crest restored on 6 Oct 2025." });
  b.node("org:gamesquare", "organization", "GameSquare", { subtype: "Parent", aliases: ["GameSquare Holdings"], src: "src-gs-ir", imp: .8 });
  b.node("org:hardscope", "organization", "HardScope", { subtype: "Parent", from: "2025-12-16", src: "src-tubefilter", summary: "Launched by Matt Kalish; becomes FaZe Media's controlling parent." });
  b.node("org:gigamoon", "organization", "Gigamoon Media", { subtype: "Investor", from: "2025-03", src: "src-gs-ir" });
  b.node("org:aev", "organization", "Atlanta Esports Ventures", { subtype: "FranchiseOwner", aliases: ["AEV"], from: "2019-05-02", src: "src-wikipedia", summary: "Paid ~$25M for the CDL slot; FaZe licenses the brand." });
  b.node("org:core", "organization", "CORE", { subtype: "CreatorCollective", aliases: ["Create, Own, Run, Everything"], from: "2026-04-30", src: "src-wikipedia", summary: "Formed by six departed FaZe creators." });
  b.node("org:optic", "organization", "OpTic Gaming", { subtype: "Rival", src: "src-timeline" });

  // ---------------------------------------------------------------- games
  for (const [id, name] of [["cod", "Call of Duty"], ["cs", "Counter-Strike"], ["fortnite", "Fortnite"], ["r6", "Rainbow Six Siege"], ["halo", "Halo"], ["pubg", "PUBG"], ["warzone", "Warzone"], ["valorant", "Valorant"]] as const)
    b.node(`game:${id}`, "game", name, { src: T, imp: id === "cod" || id === "cs" || id === "r6" ? .7 : .4 });

  // ---------------------------------------------------------------- teams (historical rosters close with validTo)
  b.node("team:cs2", "team", "FaZe Counter-Strike", { aliases: ["FaZe CS2", "FaZe CS:GO", "CS2"], from: "2016-01", src: "src-liquipedia", imp: .8, summary: "Bought G2's roster in Jan 2016 for ~$700K." });
  b.node("team:r6", "team", "FaZe Rainbow Six", { aliases: ["Rainbow Six", "R6"], from: "2018-01-18", src: "src-liquipedia", imp: .8, summary: "Entered via the Team Fontt acquisition." });
  b.node("team:atlanta", "team", "Atlanta FaZe", { aliases: ["Atlanta FaZe (CDL)", "Call of Duty team"], from: "2019-10-26", to: "2025-09-19", src: "src-wikipedia", imp: .7 });
  b.node("team:vegas", "team", "FaZe Vegas", { aliases: ["Atlanta FaZe (renamed)"], from: "2025-09-19", src: "src-hltv", imp: .7 });
  b.node("team:halo", "team", "FaZe Halo", { aliases: ["Inconceivable core"], from: "2021-08-30", src: "src-liquipedia" });
  b.node("team:warzone", "team", "FaZe Warzone", { from: "2026-03-03", src: "src-x-faze-esports" });
  b.node("team:pubg", "team", "FaZe PUBG", { from: "2017-11-10", to: "2026-01-01", src: "src-liquipedia", summary: "Disbanded on 1 Jan 2026 after eight years." });
  b.node("team:fortnite", "team", "FaZe Fortnite roster", { from: "2018-08-30", to: "2024-04-28", src: "src-inference", status: "inferred", conf: .5, note: "The timeline says the roster is gone before late 2026. The Apr 2024 creator cut is the inferred end.", summary: "Historical roster (Nate Hill, Mongraal, Sway and others)." });
  b.node("team:valorant", "team", "FaZe Valorant", { from: "2023-02-01", to: "2023-07-24", src: "src-dexerto", summary: "Challengers roster, dropped 24 Jul 2023." });
  const gm: Record<string, string> = { "team:cs2": "game:cs", "team:r6": "game:r6", "team:atlanta": "game:cod", "team:vegas": "game:cod", "team:halo": "game:halo", "team:warzone": "game:warzone", "team:pubg": "game:pubg", "team:fortnite": "game:fortnite", "team:valorant": "game:valorant" };
  for (const [team, game] of Object.entries(gm)) {
    const n = b.nodes.find((x) => x.id === team)!;
    b.rel("COMPETES_IN", team, game, { from: n.temporal.validFrom?.slice(0, 10), to: n.temporal.validTo?.slice(0, 10), src: n.temporal.sourceId, status: n.temporal.status, conf: n.temporal.confidence });
  }
  b.rel("SUCCEEDED_BY", "team:atlanta", "team:vegas", { from: "2025-09-19", src: "src-hltv", note: "Franchise rebrand, same slot." });
  // Esports operations move from FaZe Clan to FaZe Esports on 16 May 2024: close one, open the next.
  for (const t of ["team:cs2", "team:r6", "team:halo", "team:pubg"]) {
    b.rel("OPERATES", "org:faze-clan", t, { from: b.nodes.find((n) => n.id === t)!.temporal.validFrom!.slice(0, 10), to: "2024-05-16", src: GS, conf: .9 });
    b.rel("OPERATES", "org:faze-esports", t, { from: "2024-05-16", to: t === "team:pubg" ? "2026-01-01" : undefined, src: GS });
  }
  b.rel("OPERATES", "org:faze-esports", "team:warzone", { from: "2026-03-03", src: "src-x-faze-esports" });
  b.rel("OPERATES", "org:aev", "team:atlanta", { from: "2019-10-26", to: "2025-09-19", src: "src-wikipedia" });
  b.rel("OPERATES", "org:aev", "team:vegas", { from: "2025-09-19", src: "src-hltv", conf: .8, status: "reported" });
  b.rel("COLLABORATED_WITH", "org:faze-clan", "org:aev", { from: "2019-10-26", src: "src-wikipedia", note: "FaZe lends the brand; AEV owns the slot." });
  b.rel("OPERATES", "org:faze-clan", "team:fortnite", { from: "2018-08-30", to: "2024-04-28", src: "src-inference", status: "inferred", conf: .5 });
  b.rel("OPERATES", "org:faze-clan", "team:valorant", { from: "2023-02-01", to: "2023-07-24", src: "src-dexerto" });

  // ---------------------------------------------------------------- people (canonical: one node per human)
  const P = (id: string, name: string, aliases: string[], o: { imp?: number; dis?: string; summary?: string; src?: string; from?: string } = {}) =>
    b.node(`person:${id}`, "person", name, { subtype: "Person", aliases, imp: o.imp ?? .5, dis: o.dis, summary: o.summary, src: o.src ?? T, from: o.from });
  P("banks", "Richard “FaZe Banks” Bengtson", ["Banks", "FaZe Banks", "Richard Bengtson"], { imp: 1, summary: "Joined 2013 from SoaR; later COO, CEO; resigned as FaZe Media CEO on 28 Jul 2025." });
  P("apex", "Yousef “FaZe Apex” Abdelfattah", ["Apex", "FaZe Apex", "Yousef Abdelfattah"], { imp: .8 });
  P("temperrr", "Thomas “FaZe Temperrr” Oliveira", ["Temperrr", "FaZe Temperrr", "Thomas Oliveira"], { imp: .85, summary: "Invented the Temperrr Shot (Sept 2010); org president." });
  P("rug", "Brian “FaZe Rug” Awadis", ["FaZe Rug", "Rug", "Brian Awadis"], { imp: .9 });
  P("rain-nordan", "Nordan “FaZe Rain” Shat", ["FaZe Rain", "Nordan Shat", "Rain (creator)", "Rain"], { imp: .7, dis: "YouTube creator. Not the Counter-Strike player rain (Håvard Nygaard).", summary: "Joined Oct 2012; cut in the April 2024 reboot." });
  P("rain-havard", "Håvard “rain” Nygaard", ["rain", "Håvard Nygaard", "Havard Nygaard", "rain (CS)"], { imp: .7, dis: "Counter-Strike player. Not the creator FaZe Rain (Nordan Shat).", summary: "Longest-serving player at one org in CS history; benched 29 Sep 2025." });
  P("karrigan", "Finn “karrigan” Andersen", ["karrigan", "Finn Andersen"], { imp: .6 });
  P("kaysan", "Kaysan", ["FaZe Kaysan"], { imp: .8 });
  P("swagg", "Kris “FaZe Swagg” Lamberson", ["Swagg", "FaZe Swagg", "Kris Lamberson"], { imp: .7 });
  P("jason", "JasonTheWeen", ["Jason", "FaZe Jason", "JasonTheWeen"], { imp: .8 });
  P("plaqueboymax", "PlaqueBoyMax", ["Plaqueboymax", "PBM", "Max"], { imp: .55 });
  P("silky", "Silky", ["FaZe Silky"], { imp: .55 });
  P("lacy", "Lacy", ["FaZe Lacy"], { imp: .55 });
  P("zoomaa", "Tommy “ZooMaa” Paparatto", ["ZooMaa", "Tommy Paparatto"], { imp: .6 });
  P("adapt", "Adapt", ["FaZe Adapt"], { imp: .8 });
  P("scope", "Scope", ["FaZe Scope"], { imp: .55, summary: "FaZe5 (2020) winner; the org's trickshot sniper." });
  P("kay", "Frazier “Kay” Khattri", ["FaZe Kay", "Kay", "Frazier Khattri"], { imp: .4, summary: "Fired 2 Jul 2021 over the Save the Kids token." });
  P("twistt", "FaZe Twistt (trickshotter)", ["FaZe Twistt", "Twistt"], { imp: .3, dis: "2012 trickshotter. No relation to Russel “Twistzz” Van Dulken." });
  P("twistzz", "Russel “Twistzz” Van Dulken", ["Twistzz", "Russel Van Dulken"], { imp: .45, dis: "Counter-Strike rifler. Not FaZe Twistt the 2012 trickshotter." });
  P("broky", "broky", ["broky"], { imp: .45 });
  P("ropz", "ropz", ["ropz"], { imp: .45 });
  P("eslige", "EliGE", ["EliGE"], { imp: .4 });
  P("s1mple", "Oleksandr “s1mple” Kostyliev", ["s1mple", "S1mple"], { imp: .4 });
  P("enkayj", "enkay J", ["enkay J"], { imp: .3 });
  P("kalish", "Matt Kalish", ["Matthew Kalish", "DraftKings co-founder"], { imp: .75 });
  P("trink", "Lee Trink", ["Lee Trink"], { imp: .5 });
  P("gursh", "Gursh", ["Gursh"], { imp: .3 });
  P("cyber", "Cyber", ["Cyber"], { imp: .3 });
  P("soulz1", "soulz1", ["soulz1"], { imp: .3 });
  P("kds", "KDS", ["KDS"], { imp: .3 });
  P("clipz", "Eric “ClipZ” Rivera", ["ClipZ", "Eric Rivera"], { imp: .4, src: "src-wikipedia" });
  P("timid", "Jeff “FaZe Timid” Emann", ["House Cat", "FaZe Timid", "Jeff Emann", "Timid"], { imp: .35, src: "src-yt-faze", dis: "Founder known as House Cat until 22 Dec 2010, then FaZe Timid." });
  P("resistance", "Ben “Resistance” Christensen", ["Resistance", "Ben Christensen"], { imp: .35, src: "src-wikipedia" });
  for (const f of ["clipz", "timid", "resistance"]) b.rel("FOUNDED", `person:${f}`, "org:faze-clan", { from: "2010-05", src: "src-wikipedia", prec: "month" });

  // ---------------------------------------------------------------- corporate ownership (stakes are intermediate entities)
  b.rel("OWNS", "org:faze-holdings", "org:faze-clan", { from: "2022-07-19", to: "2024-03-08", src: "src-wikipedia" });
  b.stake("org:gamesquare", "org:faze-clan", 100, { from: "2024-03-08", to: "2024-05-16", src: "src-gs-ir", tag: "combined", note: "Combined entity until the FaZe Media / FaZe Esports split." });
  b.stake("org:gamesquare", "org:faze-esports", 100, { from: "2024-05-16", src: GS, tag: "esports" });
  b.stake("org:gamesquare", "org:faze-media", 51, { from: "2024-05-16", to: "2024-06-01", src: GS, tag: "initial" });
  b.stake("person:kalish", "org:faze-media", 49, { from: "2024-05-16", src: "src-esportslegal", conf: .9, tag: "kalish", note: "$11M for 49% and a board seat." });
  b.stake("org:gamesquare", "org:faze-media", 25.5, { from: "2024-06-01", to: "2025-04-01", src: "src-esportslegal", conf: .9, tag: "after-banks", prec: "month", note: "Closed when GameSquare sold its remaining stake (Mar–Apr 2025)." });
  b.stake("person:banks", "org:faze-media", 25.5, { from: "2024-06-01", to: "2025-04-01", src: "src-esportslegal", conf: .9, tag: "banks", prec: "month", note: "Closed in the Mar–Apr 2025 sale; the successor split is not published." });
  b.stake("org:gigamoon", "org:faze-media", 25.5, { from: "2025-04-01", src: "src-gs-ir", conf: .8, status: "reported", tag: "gigamoon", prec: "month", note: "Gigamoon and the founders bought GameSquare's 25.5%. The split between them is not published." });
  b.stake("org:hardscope", "org:faze-media", null, { from: "2025-12-16", src: "src-tubefilter", conf: .8, status: "reported", tag: "control", note: "Described as controlling parent. Percentage not published." });
  b.stake("person:kaysan", "team:atlanta", null, { from: "2023-08-03", to: "2025-09-19", src: "src-prnewswire", tag: "minority", note: "Minority stake; size not published. Franchise renamed FaZe Vegas on 19 Sep 2025." });
  b.stake("person:kaysan", "team:vegas", null, { from: "2025-09-19", src: "src-inference", status: "inferred", conf: .5, tag: "minority-vegas", note: "Assumed to carry over with the rename. Not stated in the timeline." });

  // ---------------------------------------------------------------- role assignments (RoleAssignment intermediate nodes)
  const FC = "org:faze-clan", FM = "org:faze-media", FE = "org:faze-esports", SPLIT = "2024-05-16";
  // Banks: one person, several roles over time
  b.assign("person:banks", "Creator", FC, { from: "2013", to: SPLIT, src: "src-wikitubia", conf: .9, note: "Joined 2013 from SoaR Gaming." });
  b.assign("person:banks", "Creator", FM, { from: SPLIT, src: GS, conf: .7, status: "reported", note: "No departure documented." });
  b.assign("person:banks", "Executive", FC, { title: "CEO", from: "2024-03-08", to: SPLIT, src: "src-gs-ir" });
  b.assign("person:banks", "Executive", FM, { title: "CEO", from: SPLIT, to: "2025-07-28", src: GS, note: "Resigned amid the MLG Coin backlash; dates vary by outlet.", conf: .85 });
  b.assign("person:apex", "Creator", FC, { from: "2011-03-06", to: SPLIT, src: "src-timeline" });
  b.assign("person:apex", "Executive", FC, { title: "COO", from: "2024-03-08", to: SPLIT, src: "src-gs-ir" });
  b.assign("person:apex", "Creator", FM, { from: SPLIT, to: "2025-12-27", src: "src-x-apex" });
  b.assign("person:temperrr", "Creator", FC, { from: "2010-08-03", to: SPLIT, src: "src-yt-faze" });
  b.assign("person:temperrr", "Executive", FC, { title: "President", from: "2024-03-08", to: SPLIT, src: "src-gs-ir" });
  b.assign("person:temperrr", "Creator", FM, { from: SPLIT, src: "src-inference", status: "inferred", conf: .5, note: "No departure documented after the 2025 exodus." });
  b.assign("person:rug", "Creator", FC, { from: "2013-01", to: SPLIT, src: "src-wikipedia", prec: "month" });
  b.assign("person:rug", "Creator", FM, { from: SPLIT, to: "2025-12-27", src: "src-x-rug" });
  b.assign("person:rain-nordan", "Creator", FC, { from: "2012-10-12", to: "2024-04-27", src: "src-dexerto" });
  b.assign("person:kay", "Creator", FC, { from: "2014-01-21", to: "2021-07-02", src: "src-yt-faze" });
  b.assign("person:adapt", "Creator", FC, { from: "2014-01-06", to: SPLIT, src: "src-yt-faze" });
  b.assign("person:adapt", "Creator", FM, { from: SPLIT, to: "2025-12-25", src: "src-x-adapt" });
  b.assign("person:adapt", "Creator", "org:core", { from: "2026-04-30", src: "src-wikipedia" });
  b.assign("person:swagg", "Creator", FC, { from: "2020-04-04", to: SPLIT, src: "src-dexerto" });
  b.assign("person:swagg", "Creator", FM, { from: SPLIT, to: "2025-12-27", src: "src-x-faze-statement" });
  b.rel("COLLABORATED_WITH", "person:swagg", FE, { from: "2026-03-03", src: "src-x-faze-esports", status: "reported", conf: .8, note: "FaZe Warzone launched “teaming with Swagg”." });
  b.assign("person:scope", "Creator", FC, { from: "2020-12-31", to: "2025-12-31", src: "src-x-scope" });
  b.assign("person:jason", "Creator", FM, { from: "2024-04-30", to: "2025-12-25", src: "src-sportskeeda" });
  b.assign("person:jason", "Creator", "org:core", { from: "2026-04-30", src: "src-wikipedia" });
  b.assign("person:plaqueboymax", "Creator", FM, { from: "2024-04-28", to: "2025-08", src: "src-dexerto", prec: "month", note: "Left in Aug 2025; day not published." });
  b.assign("person:silky", "Creator", FM, { from: "2024-04-29", to: "2025-12-25", src: "src-sportskeeda" });
  b.assign("person:silky", "Creator", "org:core", { from: "2026-04-30", src: "src-wikipedia" });
  b.assign("person:lacy", "Creator", FM, { from: "2024-05-01", to: "2025-12-25", src: "src-sportskeeda" });
  b.assign("person:lacy", "Creator", "org:core", { from: "2026-04-30", src: "src-wikipedia" });
  b.assign("person:kaysan", "Creator", FM, { from: "2023-08-03", to: "2025-12-25", src: "src-prnewswire", conf: .6, status: "reported", note: "Earliest documented date. Original join date not in the timeline." });
  b.assign("person:kaysan", "Executive", FE, { title: "Runs @FaZeEsports", from: "2025-12-25", src: "src-x-kaysan", status: "reported", conf: .8, note: "Self-described after the exodus." });
  b.assign("person:zoomaa", "Player", FC, { from: "2015-04-08", to: "2019-09-25", src: "src-x-faze-esports" });
  b.assign("person:zoomaa", "Personality", FE, { from: "2021-11-04", src: "src-x-faze-esports", status: "reported", conf: .7, note: "Returned “home” in Nov 2021; current assignment not restated." });
  b.assign("person:twistt", "Creator", FC, { from: "2012-02-07", src: "src-yt-faze", status: "reported", conf: .4, note: "Introduction video only. No departure documented." });
  b.assign("person:trink", "Executive", FC, { title: "CEO", from: "2018", to: "2023-09-09", src: "src-wikipedia", prec: "year" });
  b.assign("person:kalish", "Investor", FM, { title: "Board member", from: SPLIT, src: "src-esportslegal", conf: .9 });
  b.assign("person:gursh", "Creator", FM, { title: "Creative Lead", from: "2026-08-26", src: "src-x-faze-esports", status: "reported", conf: .85 });
  // CS roster changes
  b.assign("person:rain-havard", "Player", "team:cs2", { from: "2016-01", to: "2025-10", src: "src-hltv", prec: "month", note: "Benched 29 Sep 2025, released Oct 2025." });
  b.assign("person:karrigan", "Player", "team:cs2", { title: "In-game leader", from: "2021-02-15", to: "2026-04-20", src: "src-hltv" });
  b.assign("person:ropz", "Player", "team:cs2", { from: "2022-01", to: "2024-12-31", src: "src-liquipedia", prec: "month" });
  b.assign("person:eslige", "Player", "team:cs2", { from: "2025-01-10", src: "src-hltv" });
  b.assign("person:broky", "Player", "team:cs2", { from: "2021-02-15", to: "2025-05-05", src: "src-hltv", note: "Benched for the s1mple loan." });
  b.assign("person:broky", "Player", "team:cs2", { from: "2025-07-09", to: "2026-06-25", src: "src-liquipedia", note: "Reinstated when the loan expired; benched again 25 Jun 2026." });
  b.assign("person:s1mple", "Player", "team:cs2", { title: "Loan from Natus Vincere", from: "2025-05-05", to: "2025-07-09", src: "src-liquipedia" });
  b.assign("person:twistzz", "Player", "team:cs2", { from: "2025-09-29", src: "src-hltv", note: "Returned from Team Liquid. The earlier stint ended on a date the timeline does not give." });
  b.assign("person:enkayj", "Coach", "team:cs2", { from: "2026-04-16", src: "src-x-faze-esports" });
  for (const p of ["cyber", "soulz1", "kds"]) b.assign(`person:${p}`, "Player", "team:r6", { from: "2026-02-15", src: "src-liquipedia", status: "reported", conf: .6, note: "Earliest documented date." });
  b.rel("MEMBER_OF", "person:kalish", "org:hardscope", { from: "2025-12-16", src: "src-tubefilter", status: "reported", conf: .8, note: "Launched HardScope." });
}
