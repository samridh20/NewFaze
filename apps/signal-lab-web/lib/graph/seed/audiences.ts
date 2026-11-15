import { SeedBuilder } from "./builder";

const I = "src-inference";

/** Cohorts, narratives and the links to them. Every one is analyst-inferred (dashed in the UI), never measured. */
export function seedAudiencesAndNarratives(b: SeedBuilder): void {
  const COH: [string, string, string, string[]][] = [
    ["og-trickshot", "OG trickshot fans", "2010-05", ["ILLCAMS-era fans"]],
    ["lifestyle", "FaZe-house / lifestyle fans", "2014-01", ["House fans"]],
    ["comp-cs", "Competitive CS fans", "2016-01", ["CS fans"]],
    ["cod-sniping", "Call of Duty / sniping fans", "2011-06", ["CoD fans"]],
    ["fortnite-warzone", "Fortnite / Warzone fans", "2018-08", []],
    ["twitch-native", "New Twitch-native fans", "2024-04", []],
    ["merch-buyers", "Merchandise buyers", "2018-11", ["Buyers"]],
    ["dormant-returning", "Dormant returning fans", "2023-10", ["Lapsed fans"]],
    ["esports-only", "Esports-only fans", "2024-05", []],
    ["creator-only", "Creator-only fans", "2024-04", []],
  ];
  for (const [id, name, from, aliases] of COH)
    b.node(`cohort:${id}`, "audience_cohort", name, { from, aliases, src: I, status: "inferred", conf: .55, imp: .5, summary: "Analyst-defined segment. Membership and size are not measured in the source data." });
  const NAR: [string, string, string][] = [
    ["faze-is-back", "“FaZe is back”", "2023-10-20"], ["nostalgia", "Nostalgia", "2016-03-07"],
    ["authenticity", "Creator authenticity", "2023-03-12"], ["sellout", "Corporate / sellout backlash", "2022-09-26"],
    ["esports-dominance", "Esports dominance", "2022-05-22"], ["departure-risk", "Creator departure risk", "2025-07-28"],
  ];
  for (const [id, name, from] of NAR)
    b.node(`narr:${id}`, "narrative", name, { from, src: I, status: "inferred", conf: .55, imp: .5, summary: "Aggregated theme. Individual comments are not stored as nodes." });

  const link = (t: Parameters<SeedBuilder["rel"]>[0], f: string, to: string, from: string, conf = .6, note?: string) =>
    b.rel(t, f, to, { from, src: I, status: "inferred", conf, note });
  const reach: [string, string[]][] = [
    ["illcams-38", ["og-trickshot", "cod-sniping"]], ["illcams-50", ["og-trickshot", "dormant-returning"]],
    ["howto-temperrr", ["og-trickshot"]], ["teamtage-1m", ["og-trickshot", "cod-sniping"]], ["faze5-2014", ["lifestyle"]],
    ["rain-1m", ["lifestyle"]], ["apex-5yrs", ["og-trickshot", "dormant-returning"]], ["ny-reunion", ["lifestyle", "dormant-returning"]],
    ["fflan", ["og-trickshot", "dormant-returning", "cod-sniping"]], ["subathon-2024", ["twitch-native", "creator-only"]],
    ["subathon-2", ["twitch-native", "creator-only"]], ["like-that", ["cod-sniping", "og-trickshot"]],
    ["mw2-10k", ["og-trickshot", "cod-sniping", "dormant-returning"]], ["stars-post", ["esports-only", "comp-cs"]],
    ["post-adapt", ["creator-only", "twitch-native"]], ["post-rug", ["lifestyle", "creator-only"]], ["post-apex", ["lifestyle", "creator-only"]],
    ["post-kaysan", ["esports-only", "creator-only"]], ["post-faze-stmt", ["esports-only", "creator-only"]],
  ];
  for (const [c, cohorts] of reach) {
    const date = b.nodes.find((n) => n.id === `c:${c}`)!.temporal.validFrom!.slice(0, 10);
    for (const k of cohorts) link("REACHED", `c:${c}`, `cohort:${k}`, date);
  }
  const aff: [string, string, string, string][] = [
    ["ev:pgl-2022", "cohort:comp-cs", "2022-05-22", "AFFECTED"], ["ev:exodus-1", "cohort:creator-only", "2025-12-25", "AFFECTED"],
    ["ev:exodus-2", "cohort:lifestyle", "2025-12-27", "AFFECTED"], ["ev:class-2024", "cohort:twitch-native", "2024-04-28", "AFFECTED"],
  ];
  for (const [f, t, d, ty] of aff) link(ty as "AFFECTED", f, t, d);
  const tgt: [string, string, string][] = [
    ["camp:champion", "cohort:merch-buyers", "2018-11-01"], ["camp:gfuel-2024", "cohort:twitch-native", "2024-09-02"],
    ["camp:draftkings", "cohort:esports-only", "2021-11-17"], ["camp:totinos", "cohort:lifestyle", "2021-07-27"], ["camp:nissan", "cohort:lifestyle", "2019-03-25"],
  ];
  for (const [f, t, d] of tgt) link("TARGETS", f, t, d);
  link("PURCHASED", "cohort:merch-buyers", "prod:champion-hoodie", "2018-11-22");
  link("PURCHASED", "cohort:merch-buyers", "prod:rug-merch", "2019-08-03");
  link("PURCHASED", "cohort:lifestyle", "prod:rug-merch", "2019-08-03");
  link("PURCHASED", "cohort:twitch-native", "prod:twitch-subs", "2024-09");
  link("WATCHED", "cohort:comp-cs", "ev:pgl-2022", "2022-05-22");
  link("WATCHED", "cohort:cod-sniping", "series:illcams", "2010-06-02");
  link("ASSOCIATED_WITH", "cohort:esports-only", "cohort:merch-buyers", "2024-05-16", .4, "Assumed audience overlap. Not measured.");
  link("ASSOCIATED_WITH", "cohort:og-trickshot", "cohort:dormant-returning", "2023-10-20", .5);
  const res: [string, string, string][] = [
    ["og-trickshot", "nostalgia", "2016-03-07"], ["dormant-returning", "faze-is-back", "2023-10-20"], ["dormant-returning", "nostalgia", "2023-10-20"],
    ["esports-only", "esports-dominance", "2022-05-22"], ["comp-cs", "esports-dominance", "2022-05-22"], ["creator-only", "authenticity", "2023-03-12"],
    ["creator-only", "departure-risk", "2025-07-28"], ["lifestyle", "departure-risk", "2025-12-25"], ["merch-buyers", "sellout", "2022-09-26"],
  ];
  for (const [c, n, d] of res) link("RESONATED_WITH", `cohort:${c}`, `narr:${n}`, d);
  const aff2: [string, string, string][] = [
    ["ev:pgl-2022", "esports-dominance", "2022-05-22"], ["ev:six-inv-2026", "esports-dominance", "2026-02-15"], ["ev:lockup-2022", "sellout", "2022-09-26"],
    ["ev:trink-fired-2023", "sellout", "2023-09-09"], ["ev:teeqo-2023", "authenticity", "2023-03-12"], ["ev:save-kids-2021", "authenticity", "2021-07-02"],
    ["ev:viewbot-2025", "authenticity", "2025-11-01"], ["ev:gs-announce-2023", "faze-is-back", "2023-10-20"], ["ev:class-2024", "faze-is-back", "2024-04-28"],
    ["ev:banks-resigns-2025", "departure-risk", "2025-07-28"], ["ev:exodus-1", "departure-risk", "2025-12-25"], ["ev:exodus-2", "departure-risk", "2025-12-27"],
    ["c:fflan", "nostalgia", "2024-05-30"], ["c:apex-5yrs", "nostalgia", "2016-03-07"], ["c:mw2-10k", "nostalgia", "2026-03-14"], ["ev:core-2026", "departure-risk", "2026-04-30"],
  ];
  for (const [f, n, d] of aff2) link("AFFECTED", f, `narr:${n}`, d);

  // claims: facts that need more than one source or carry a caveat
  const claim = (id: string, statement: string, sources: string[], conf: number, status: "verified" | "reported" | "inferred" | "disputed", subjects: string[]) => {
    b.claim(`claim:${id}`, statement, sources, conf, status);
    subjects.forEach((s) => b.rel("SUPPORTED_BY", s, `claim:${id}`, { src: sources[0], conf, status, from: null }));
  };
  claim("media-split", "FaZe Media was formed on 16 May 2024; GameSquare kept 100% of the esports assets under FaZe Esports.", ["gamesquare-release-2024-05-16"], .99, "verified", ["org:faze-media", "org:faze-esports"]);
  claim("exodus", "Seven creators quit on 25 Dec 2025 and four more on 27–28 Dec; esports was ring-fenced.", ["src-x-adapt", "src-x-kaysan", "src-x-rug", "src-x-apex", "src-dexerto"], .95, "verified", ["ev:exodus-1", "ev:exodus-2"]);
  claim("identity-rain", "Nordan “FaZe Rain” Shat (creator) and Håvard “rain” Nygaard (Counter-Strike) are different people.", ["src-yt-faze", "src-hltv"], .99, "verified", ["person:rain-nordan", "person:rain-havard"]);
  claim("identity-twist", "FaZe Twistt (2012 trickshotter) is not Russel “Twistzz” Van Dulken (CS, signed 2021).", ["src-yt-faze", "src-hltv"], .99, "verified", ["person:twistt", "person:twistzz"]);
  claim("subathon-12m", "Banks' $12M subathon figure was walked back and is not an accepted number.", ["src-esportslegal"], .6, "disputed", ["camp:subathon-2024"]);
  claim("star-rule", "The five crest stars map to first place at each game's defining world event. FaZe has not published a key; this is reconstructed.", ["src-liquipedia"], .75, "inferred", ["team:r6", "ev:six-inv-2026"]);
  claim("cohorts", "Audience cohorts and narrative links are analyst-inferred, not measured.", [I], .5, "inferred", ["cohort:esports-only", "cohort:og-trickshot", "narr:nostalgia"]);
  claim("stake-chain", "FaZe Media ownership: GameSquare 51% / Kalish 49% (May 2024) → Kalish 49 / Banks 25.5 / GameSquare 25.5 (Jun 2024) → GameSquare exits (Mar–Apr 2025).", ["gamesquare-release-2024-05-16", "src-esportslegal", "src-gs-ir"], .9, "verified", ["org:faze-media"]);
}
