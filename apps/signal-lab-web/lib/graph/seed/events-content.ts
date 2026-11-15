import { SeedBuilder } from "./builder";

const T = "src-timeline";
const FC = "org:faze-clan", FM = "org:faze-media", FE = "org:faze-esports";

/** Events, content, campaigns, brands, products, metrics. Metrics marked "reported" come from the timeline. */
export function seedEventsContentCommerce(b: SeedBuilder): void {
  // ---------------------------------------------------------------- events
  type EK = "Signing" | "Departure" | "Tournament" | "Championship" | "Controversy" | "CorporateChange" | "ProductLaunch";
  const E = (id: string, kind: EK, name: string, date: string, src: string, o: { summary?: string; conf?: number; status?: "verified" | "reported"; note?: string } = {}) =>
    b.node(`ev:${id}`, "event", name, { subtype: kind, from: date, src, summary: o.summary, conf: o.conf, status: o.status, note: o.note, imp: kind === "Championship" ? .7 : .5 });
  E("founded", "CorporateChange", "FaZe Sniping founded", "2010-05", "src-wikipedia");
  E("apex-joins", "Signing", "Apex joins on his 14th birthday", "2011-03-06", "src-timeline");
  E("cdl-2021", "Championship", "CDL Championship 2021 (star one)", "2021-08-22", "src-liquipedia");
  E("six-sweden-2021", "Tournament", "Six Sweden Major 2021", "2021-11-14", "src-liquipedia");
  E("katowice-2022", "Tournament", "IEM Katowice 2022", "2022-02-27", "src-liquipedia");
  E("pgl-2022", "Championship", "PGL Major Antwerp 2022 (star two)", "2022-05-22", "src-hltv");
  E("spac-2022", "CorporateChange", "FaZe lists on Nasdaq via SPAC", "2022-07-19", "src-wikipedia");
  E("lockup-2022", "CorporateChange", "Insider lock-up crash", "2022-09-26", "src-timeline", { status: "reported" });
  E("save-kids-2021", "Controversy", "“Save the Kids” token scandal", "2021-07-02", "src-tubefilter");
  E("teeqo-2023", "Controversy", "Teeqo's “Dear FaZe Clan”", "2023-03-12", "src-dexerto");
  E("trink-fired-2023", "CorporateChange", "CEO Lee Trink terminated", "2023-09-09", "src-timeline", { note: "Reported 9–10 Sep 2023." });
  E("halo-2023", "Championship", "Halo World Championship 2023 (star three)", "2023-10-15", "src-halo-waypoint");
  E("gs-announce-2023", "CorporateChange", "GameSquare announces ~$17M acquisition", "2023-10-20", "src-gs-ir");
  E("gs-close-2024", "CorporateChange", "Acquisition completes; FAZE delists", "2024-03-08", "src-gs-ir");
  E("reboot-2024", "Departure", "Post-acquisition reboot: 17 creators cut", "2024-04-27", "src-dexerto");
  E("class-2024", "Signing", "Four-day signing class: Plaqueboymax, Silky, Jason, Lacy", "2024-04-28", "src-sportskeeda");
  E("faze-media-2024", "CorporateChange", "FaZe Media formed, split from FaZe Esports", "2024-05-16", "gamesquare-release-2024-05-16");
  E("ewc-cod-2024", "Tournament", "Esports World Cup 2024: Call of Duty", "2024-08-18", "src-timeline");
  E("six-inv-2025", "Championship", "Six Invitational 2025 (star four)", "2025-02-16", "src-liquipedia");
  E("gs-exit-2025", "CorporateChange", "GameSquare sells its FaZe Media stake", "2025-04-01", "src-gs-ir", { note: "Announced Mar–Apr 2025." });
  E("banks-resigns-2025", "Controversy", "Banks resigns as CEO amid MLG Coin backlash", "2025-07-28", "src-esportslegal", { status: "reported", conf: .85 });
  E("rain-benched-2025", "Departure", "rain benched after nearly ten years", "2025-09-29", "src-hltv");
  E("viewbot-2025", "Controversy", "Subathon II viewbotting accusations", "2025-11", "src-esportslegal", { status: "reported" });
  E("hardscope-2025", "CorporateChange", "Kalish launches HardScope", "2025-12-16", "src-tubefilter");
  E("exodus-1", "Departure", "Christmas exodus, wave one", "2025-12-25", "src-x-adapt");
  E("exodus-2", "Departure", "Christmas exodus, wave two", "2025-12-27", "src-x-rug");
  E("scope-leaves", "Departure", "Scope: “I Left FaZe Clan”", "2025-12-31", "src-x-scope");
  E("six-inv-2026", "Championship", "Six Invitational 2026 (star five)", "2026-02-15", "src-liquipedia");
  E("karrigan-leaves", "Departure", "karrigan leaves for Falcons", "2026-04-20", "src-liquipedia");
  E("core-2026", "CorporateChange", "Six departed creators launch CORE", "2026-04-30", "src-wikipedia");
  E("cdl-2026", "Tournament", "CDL Championship 2026 (no star)", "2026-07-19", "src-liquipedia");
  E("ewc-r6-2026", "Championship", "Esports World Cup 2026: Rainbow Six", "2026-08-15", "src-gs-ir");
  E("roman-cup-2026", "Tournament", "Roman Imperium Cup IX (first CS2 trophy in ~900 days)", "2026-10-10", "src-x-faze-esports");

  // chronology chains use PRECEDED only; the timeline never states causation
  const chain = (ids: string[]) => ids.slice(0, -1).forEach((id, i) => b.rel("PRECEDED", `ev:${id}`, `ev:${ids[i + 1]}`, { from: b.nodes.find((n) => n.id === `ev:${ids[i + 1]}`)!.temporal.validFrom!.slice(0, 10), src: T, conf: .9 }));
  chain(["spac-2022", "lockup-2022", "teeqo-2023", "trink-fired-2023", "gs-announce-2023", "gs-close-2024", "reboot-2024", "class-2024", "faze-media-2024"]);
  chain(["faze-media-2024", "gs-exit-2025", "banks-resigns-2025", "hardscope-2025", "exodus-1", "exodus-2", "scope-leaves", "core-2026"]);
  chain(["cdl-2021", "pgl-2022", "halo-2023", "six-inv-2025", "six-inv-2026", "ewc-r6-2026"]);
  b.rel("ASSOCIATED_WITH", "ev:founded", FC, { from: "2010-05", src: "src-wikipedia", prec: "month" });

  // championships and who took part (edge date = event date, so history persists but appears at the right time)
  const took = (ev: string, parts: string[]) => parts.forEach((p) => b.rel("PARTICIPATED_IN", p, `ev:${ev}`, { from: b.nodes.find((n) => n.id === `ev:${ev}`)!.temporal.validFrom!.slice(0, 10), src: b.nodes.find((n) => n.id === `ev:${ev}`)!.temporal.sourceId, prec: b.nodes.find((n) => n.id === `ev:${ev}`)!.temporal.datePrecision }));
  took("pgl-2022", ["team:cs2", "person:karrigan", "person:rain-havard", "person:broky", "person:twistzz", "person:ropz"]);
  took("katowice-2022", ["team:cs2"]);
  took("cdl-2021", ["team:atlanta"]);
  took("halo-2023", ["team:halo"]);
  took("six-inv-2025", ["team:r6"]);
  took("six-inv-2026", ["team:r6", "person:cyber", "person:soulz1", "person:kds"]);
  took("ewc-r6-2026", ["team:r6", "person:cyber", "person:soulz1", "person:kds"]);
  took("cdl-2026", ["team:vegas"]);
  took("ewc-cod-2024", ["team:atlanta"]);
  took("roman-cup-2026", ["team:cs2"]);
  took("six-sweden-2021", ["team:r6"]);
  took("apex-joins", ["person:apex"]);
  took("class-2024", ["person:plaqueboymax", "person:silky", "person:jason", "person:lacy"]);
  took("save-kids-2021", ["person:kay"]);
  took("exodus-1", ["person:adapt", "person:jason", "person:lacy", "person:silky", "person:kaysan"]);
  took("exodus-2", ["person:apex", "person:rug", "person:swagg"]);
  took("scope-leaves", ["person:scope"]);
  took("banks-resigns-2025", ["person:banks"]);
  took("rain-benched-2025", ["person:rain-havard"]);
  took("karrigan-leaves", ["person:karrigan"]);
  took("core-2026", ["org:core", "person:adapt", "person:jason", "person:lacy", "person:silky"]);
  took("trink-fired-2023", ["person:trink"]);
  took("gs-announce-2023", ["org:gamesquare", "person:banks", "person:temperrr", "person:apex"]);
  took("faze-media-2024", ["org:gamesquare", "person:banks", "person:kalish"]);
  took("hardscope-2025", ["person:kalish", "org:hardscope"]);
  took("reboot-2024", ["person:rain-nordan"]);
  b.rel("AFFECTED", "ev:gs-close-2024", FC, { from: "2024-03-08", src: "src-gs-ir" });
  b.rel("AFFECTED", "ev:faze-media-2024", FE, { from: "2024-05-16", src: "gamesquare-release-2024-05-16" });
  b.rel("AFFECTED", "ev:exodus-2", FM, { from: "2025-12-27", src: "src-dexerto", status: "reported", conf: .85, note: "FaZe Media lost most of its creator roster." });

  // ---------------------------------------------------------------- channels and series
  b.node("ch:yt-faze", "channel", "FaZe Clan on YouTube", { subtype: "YouTube", aliases: ["@FaZe YouTube"], from: "2010-05-31", src: "src-yt-faze", imp: .8 });
  b.node("ch:twitch-faze", "channel", "FaZe on Twitch", { subtype: "Twitch", from: "2024-09", src: "src-esportslegal", prec: "month" });
  b.node("ch:x-fazeclan", "channel", "@FaZeClan on X", { subtype: "X", from: "2010-05", src: "src-timeline", note: "Last original post 30 Apr 2026." });
  b.node("ch:x-fazeesports", "channel", "@FaZeEsports on X", { subtype: "X", from: "2024-05-16", src: "src-x-faze-esports" });
  b.rel("OPERATES", FC, "ch:yt-faze", { from: "2010-05-31", to: "2024-05-16", src: "src-yt-faze" });
  b.rel("OPERATES", FM, "ch:yt-faze", { from: "2024-05-16", src: GS(), conf: .7, status: "reported" });
  b.rel("OPERATES", FM, "ch:twitch-faze", { from: "2024-09", src: "src-esportslegal", prec: "month" });
  b.rel("OPERATES", FE, "ch:x-fazeesports", { from: "2024-05-16", src: "src-x-faze-esports" });
  b.rel("OPERATES", FC, "ch:x-fazeclan", { from: "2010-05", src: T, prec: "month" });
  const SER = (id: string, name: string, from: string, aliases: string[] = [], summary?: string, to?: string) =>
    b.node(`series:${id}`, "content_series", name, { aliases, from, to, src: "src-yt-faze", summary, imp: .6 });
  SER("illcams", "ILLCAMS", "2010-06-02", ["ILLCAMS killcam compilations"], "Killcam series; Episode 38 (5.44M views) is the peak.");
  SER("faze5", "FaZe5", "2013-03-16", ["#FAZE5"], "Recruitment contest: 2013, 2014 (G FUEL) and 2020 editions.");
  SER("subathon", "Subathon", "2024-09", ["FaZe Subathon"], "Reboot-era continuous livestream.");
  SER("teamtage", "Teamtage", "2010-12-16", ["Teamtages"], "Roster-wide montage drops; roughly fifty over fifteen years.");
  SER("recruitment", "Recruitment challenge", "2013-03-16", ["Recruitment challenges"], "FaZe5 (2013, 2014, 2020) and FaZe1 (2022).");
  SER("nostalgia", "Nostalgia / reunion content", "2016-03-07", ["Founder content"], "Anniversary montages, house reunions, the Founding Fathers LAN.");
  b.rel("PART_OF_SERIES", "series:faze5", "series:recruitment", { from: "2013-03-16", src: T });

  // ---------------------------------------------------------------- content assets with observed view counts
  type C = [string, string, string, string, string, string, number | null, string[], string[]]; // id, name, date, channel, series|"", sourceId, views, creators, featured
  const content: C[] = [
    ["illcams-38", "ILLCAMS Episode 38", "2012-02-25", "ch:yt-faze", "series:illcams", "src-yt-faze", 5441508, [], []],
    ["illcams-50", "ILLCAMS 50", "2017-05-30", "ch:yt-faze", "series:illcams", "src-yt-faze", 1620000, [], []],
    ["howto-temperrr", "How to Temperrr Shot", "2011-01-31", "ch:yt-faze", "", "src-yt-faze", 5750000, ["person:temperrr"], []],
    ["teamtage-1m", "The 1 Million Subscribers Teamtage", "2012-10-08", "ch:yt-faze", "series:teamtage", "src-yt-faze", 12134253, [], []],
    ["faze5-2013", "#FAZE5 announcement (2013)", "2013-03-16", "ch:yt-faze", "series:faze5", "src-yt-faze", 564000, [], []],
    ["faze5-2014", "#FAZE5 returns, powered by G FUEL", "2014-04-20", "ch:yt-faze", "series:faze5", "src-yt-faze", 480805, [], []],
    ["rain-1m", "FaZe Rain's 1 Million Subscribers montage", "2014-10-31", "ch:yt-faze", "", "src-timeline", 3550000, ["person:rain-nordan"], []],
    ["apex-5yrs", "FaZe Apex: 5 Years in FaZe Clan", "2016-03-07", "ch:yt-faze", "series:nostalgia", "src-timeline", 2750000, ["person:apex"], []],
    ["ny-reunion", "The FaZe House New York Reunites", "2021-05", "ch:yt-faze", "series:nostalgia", "src-yt-faze", null, [], ["person:apex", "person:banks", "person:adapt", "person:temperrr"]],
    ["fflan", "The Founding Fathers LAN", "2024-05-30", "ch:twitch-faze", "series:nostalgia", "src-timeline", 10000, [], ["person:banks", "person:apex", "person:adapt", "person:kaysan", "person:rug", "person:scope", "person:silky", "person:swagg", "person:temperrr", "person:zoomaa"]],
    ["subathon-2024", "FaZe Subathon (Sept 2024)", "2024-09", "ch:twitch-faze", "series:subathon", "src-esportslegal", null, [], []],
    ["subathon-2", "Subathon II (Oct 2025)", "2025-10", "ch:twitch-faze", "series:subathon", "src-esportslegal", null, [], ["person:adapt", "person:jason"]],
    ["like-that", "“LIKE THAT” (Scope montage)", "2025-05-17", "ch:yt-faze", "", "src-x-faze-esports", 1770000, ["person:scope"], []],
    ["mw2-10k", "$10,000 MW2 trickshotting challenge", "2026-03-14", "ch:x-fazeclan", "", "src-timeline", 4430000, [], []],
    ["stars-post", "“Let's talk about the stars”", "2026-08-19", "ch:x-fazeesports", "", "src-x-faze-esports", 644000, [], []],
    ["post-adapt", "Adapt exodus post", "2025-12-25", "ch:x-fazeclan", "", "src-x-adapt", 20200000, ["person:adapt"], []],
    ["post-kaysan", "Kaysan exodus post", "2025-12-25", "ch:x-fazeesports", "", "src-x-kaysan", 5090000, ["person:kaysan"], []],
    ["post-rug", "Rug departure post", "2025-12-27", "ch:x-fazeclan", "", "src-x-rug", 11500000, ["person:rug"], []],
    ["post-apex", "Apex departure post", "2025-12-27", "ch:x-fazeclan", "", "src-x-apex", 15800000, ["person:apex"], []],
    ["post-faze-stmt", "FaZe statement on the exodus", "2025-12-28", "ch:x-fazeclan", "", "src-x-faze-statement", 7000000, [], []],
  ];
  for (const [id, name, date, ch, series, src, views, creators, featured] of content) {
    const kind = id.startsWith("post-") ? "SocialPost" : id.startsWith("subathon") || id === "fflan" ? "Stream" : "Video";
    b.node(`c:${id}`, "content_asset", name, { subtype: kind, from: date, src, imp: views && views > 5e6 ? .8 : .5 });
    b.rel("PUBLISHED_ON", `c:${id}`, ch, { from: date, src });
    if (series) b.rel("PART_OF_SERIES", `c:${id}`, series, { from: date, src });
    creators.forEach((p) => b.rel("CREATED", p, `c:${id}`, { from: date, src }));
    featured.forEach((p) => b.rel("FEATURED_IN", p, `c:${id}`, { from: date, src }));
    // Lifetime view counts were taken in Sept 2026, so they are observed then, not on the publish date. Dating them at publish
    // time would leak years of later growth into an earlier dossier. The Founding Fathers LAN peak was read live.
    if (views !== null) b.metric(`m:views-${id}`, "Views", `${name}: lifetime views`, `c:${id}`, views, id === "fflan" ? "peak concurrent viewers (ZooMaa's stream)" : "views", id === "fflan" ? date : "2026-09-01", src, id === "fflan" ? "reported" : "reported", id === "fflan" ? "Lower bound reported (“above 10,000”)." : `Lifetime views as of Sept 2026 (the timeline snapshot). Published ${date}.`);
  }
  b.rel("FEATURED_IN", "person:temperrr", "c:howto-temperrr", { from: "2011-01-31", src: "src-yt-faze" });
  // event -> content ordering (no causal claim)
  b.rel("PRECEDED", "ev:exodus-1", "c:post-adapt", { from: "2025-12-25", src: "src-x-adapt" });
  b.rel("PRECEDED", "ev:exodus-1", "c:post-kaysan", { from: "2025-12-25", src: "src-x-kaysan" });
  b.rel("PRECEDED", "ev:exodus-2", "c:post-rug", { from: "2025-12-27", src: "src-x-rug" });
  b.rel("PRECEDED", "ev:exodus-2", "c:post-apex", { from: "2025-12-27", src: "src-x-apex" });
  b.rel("PRECEDED", "ev:exodus-2", "c:post-faze-stmt", { from: "2025-12-28", src: "src-x-faze-statement" });
  b.rel("PRECEDED", "ev:ewc-r6-2026", "c:stars-post", { from: "2026-08-19", src: "src-x-faze-esports", conf: .85, note: "Posted four days after the EWC final; the post is about the crest stars." });
  b.rel("PRECEDED", "ev:six-inv-2026", "c:stars-post", { from: "2026-08-19", src: "src-x-faze-esports", conf: .7, status: "reported" });
  b.rel("FOLLOWED_BY", "c:mw2-10k", "c:stars-post", { from: "2026-08-19", src: "src-inference", status: "inferred", conf: .5, note: "Chronology only." });

  // ---------------------------------------------------------------- brands, campaigns, products
  const BR = (id: string, name: string, src = "src-prnewswire") => b.node(`brand:${id}`, "brand", name, { subtype: "Brand", src, imp: .5 });
  BR("gfuel", "G FUEL", "src-wikipedia"); BR("nissan", "Nissan", "src-tubefilter"); BR("mcdonalds", "McDonald's", "src-wikipedia");
  BR("champion", "Champion", "src-wikipedia"); BR("porsche", "Porsche"); BR("rollbit", "Rollbit"); BR("draftkings", "DraftKings");
  BR("xfinity", "Xfinity"); BR("totinos", "Totino's", "src-esports-insider"); BR("ghost", "GHOST Energy");
  type K = [string, string, string, string | undefined, string, string, string, string[], string[]]; // id,name,from,to,brand,src,subtype,participants,targets
  const camps: K[] = [
    ["gfuel", "G FUEL partnership", "2012", undefined, "brand:gfuel", "src-wikipedia", "SponsorActivation", [FC], []],
    ["gfuel-faze5", "#FAZE5 powered by G FUEL", "2014-04-20", "2014-06-30", "brand:gfuel", "src-yt-faze", "SponsorActivation", [FC], []],
    ["gfuel-2024", "G FUEL revival with equity stake", "2024-09-02", undefined, "brand:gfuel", "src-prnewswire", "SponsorActivation", [FM], []],
    ["nissan", "Nissan partnership", "2019-03-25", undefined, "brand:nissan", "src-tubefilter", "SponsorActivation", [FC], []],
    ["mcdonalds", "McDonald's sponsorship", "2021-08", undefined, "brand:mcdonalds", "src-wikipedia", "SponsorActivation", [FC], []],
    ["champion", "Champion apparel capsules", "2018-11", undefined, "brand:champion", "src-wikipedia", "MerchandiseLaunch", [FC], []],
    ["draftkings", "DraftKings official partner", "2021-11-17", undefined, "brand:draftkings", "src-timeline", "SponsorActivation", [FC], []],
    ["totinos", "Totino's x Lil Yachty series", "2021-07-27", undefined, "brand:totinos", "src-timeline", "BrandedStream", [FC], []],
    ["porsche", "Porsche multi-year partnership", "2023-01-19", undefined, "brand:porsche", "src-timeline", "SponsorActivation", [FC], []],
    ["xfinity", "Xfinity official partner", "2022-10-20", undefined, "brand:xfinity", "src-prnewswire", "SponsorActivation", [FC], []],
    ["rollbit", "Rollbit CS2 jersey sponsorship", "2025-09-24", undefined, "brand:rollbit", "src-prnewswire", "SponsorActivation", [FE, "team:cs2"], ["cohort:comp-cs", "cohort:esports-only"]],
    ["faze1", "FaZe1: The Warehouse", "2022-05-05", "2022-05-26", "brand:nissan", "src-prnewswire", "BrandedStream", [FC], []],
    ["subathon-2024", "Subathon 2024 (G FUEL presenting)", "2024-09", "2024-09-30", "brand:gfuel", "src-prnewswire", "BrandedStream", [FM], ["cohort:twitch-native"]],
    ["subathon-2", "Subathon II (Oct 2025)", "2025-10", "2025-10-31", "brand:gfuel", "src-esportslegal", "BrandedStream", [FM], ["cohort:twitch-native", "cohort:creator-only"]],
  ];
  for (const [id, name, from, to, brand, src, kind, parts, targets] of camps) {
    const unsure = id === "gfuel" || id === "xfinity" || id === "subathon-2" || id === "faze1";
    b.node(`camp:${id}`, "campaign", name, { subtype: kind, from, to, src, imp: id === "rollbit" ? .8 : .55, status: id === "subathon-2" || id === "subathon-2024" ? "reported" : "verified", conf: unsure ? .8 : .95, note: id === "gfuel" ? "Renewed with an equity stake on 2 Sep 2024." : id === "faze1" ? "Planned 15-day run; paused about six days in for COVID, resumed, and named a winner on 26 May." : id === "subathon-2024" ? "Day-level start not published." : undefined });
    b.rel("SPONSORED_BY", `camp:${id}`, brand, { from, to, src, prec: from.length === 7 ? "month" : undefined });
    parts.forEach((p) => b.rel("PARTICIPATED_IN", p, `camp:${id}`, { from, to, src }));
    targets.forEach((t) => b.rel("TARGETS", `camp:${id}`, t, { from, to, src: "src-inference", status: "inferred", conf: .6 }));
  }
  b.rel("PART_OF_SERIES", "camp:gfuel-faze5", "series:faze5", { from: "2014-04-20", src: "src-yt-faze" });
  b.rel("PART_OF_SERIES", "camp:faze1", "series:recruitment", { from: "2022-05-05", src: "src-prnewswire" });
  b.rel("PART_OF_SERIES", "camp:subathon-2024", "series:subathon", { from: "2024-09", src: "src-esportslegal" });
  b.rel("PART_OF_SERIES", "camp:subathon-2", "series:subathon", { from: "2025-10", src: "src-esportslegal" });
  b.rel("PROMOTES", "camp:gfuel-faze5", "series:faze5", { from: "2014-04-20", src: "src-yt-faze" });
  b.rel("FOLLOWED_BY", "camp:gfuel", "camp:gfuel-2024", { from: "2024-09-02", src: "src-prnewswire", note: "Revival twelve years after the original tie-up." });
  // campaign participation as an intermediate entity (who, in which campaign, in what capacity)
  for (const [p, c, role] of [["person:adapt", "camp:subathon-2", "Subathon II charity pledge"], ["person:jason", "camp:subathon-2", "Subathon II charity pledge"]] as const) {
    const id = `cp:${p.split(":")[1]}:${c.split(":")[1]}`;
    b.node(id, "campaign_participation", `${b.nodes.find((n) => n.id === p)!.name.split(" ")[0]} in ${b.nodes.find((n) => n.id === c)!.name}`, { subtype: "CampaignParticipation", from: "2025-10", to: "2025-10-31", src: "src-esportslegal", attrs: { role }, status: "reported", conf: .85 });
    b.rel("PARTICIPATED_IN", p, id, { from: "2025-10", to: "2025-10-31", src: "src-esportslegal", status: "reported", conf: .85 });
    b.rel("OF", id, c, { from: "2025-10", to: "2025-10-31", src: "src-esportslegal", status: "reported", conf: .85 });
  }

  // products and outcomes
  type PR = [string, string, string, string, string, string, string]; // id,name,subtype,date,campaign,brand,src
  const prods: PR[] = [
    ["champion-hoodie", "Champion x FaZe hoodie capsule", "Apparel capsule", "2018-11-22", "camp:champion", "brand:champion", "src-wikipedia"],
    ["gfuel-berry", "G FUEL “FaZe Berry” flavor", "Energy-drink flavor", "2019-07-16", "camp:gfuel", "brand:gfuel", "src-pabst"],
    ["ghost-pop", "GHOST “FaZe Pop” flavor", "Energy-drink flavor", "2023-02-22", "camp:xfinity", "brand:ghost", "src-prnewswire"],
    ["rug-merch", "FaZe Rug merch drop (Santa Ana)", "Merchandise", "2019-08-03", "camp:champion", "brand:champion", "src-pabst"],
    ["twitch-subs", "Twitch subscriptions (Subathon)", "Subscription", "2024-09", "camp:subathon-2024", "brand:gfuel", "src-esportslegal"],
  ];
  for (const [id, name, sub, date, camp, brand, src] of prods) {
    b.node(`prod:${id}`, "product", name, { subtype: sub, from: date, src, imp: .45, ...(id === "ghost-pop" ? { note: "Linked to the GHOST launch; the Xfinity campaign link is a placeholder tie-in.", status: "reported" as const, conf: .6 } : {}) });
    if (id !== "ghost-pop") b.rel("PROMOTES", camp, `prod:${id}`, { from: date, src });
    b.rel("PROMOTES", brand, `prod:${id}`, { from: date, src });
  }
  b.rel("PRECEDED", "prod:gfuel-berry", "prod:ghost-pop", { from: "2023-02-22", src: "src-inference", status: "inferred", conf: .4, note: "Chronology only." });
  b.rel("PRECEDED", "ev:rug-meetup-police", "prod:rug-merch", { from: "2019-08-03", src: "src-pabst" });

  // ---------------------------------------------------------------- outcome metrics (reported = in the timeline; mock = invented demo value)
  b.metric("m:rollbit-revenue", "Revenue", "Rollbit sponsorship: annual revenue", "camp:rollbit", 3250000, "USD/year", "2025-09-24", "src-prnewswire", "verified", "Up from $1.75M/year; centre-patch placement on the CS jersey.");
  b.metric("m:forbes-2019", "Valuation", "Forbes valuation of FaZe", FC, 240000000, "USD", "2019-11-05", "src-forbes", "reported", "On roughly $35M revenue; an outside estimate.");
  b.metric("m:forbes-2019-followers", "Followers", "Social followers (Forbes, Nov 2019)", FC, 19000000, "followers", "2019-11-05", "src-forbes", "reported", "As reported by Forbes alongside the $240M valuation.");
  b.metric("m:forbes-2020", "Valuation", "Forbes valuation of FaZe (Dec 2020)", FC, 305000000, "USD", "2020-12-05", "src-forbes", "reported", "On roughly $40M estimated annual revenue.");
  b.metric("m:yt-1b-views", "Views", "FaZe YouTube channel passes one billion views", "ch:yt-faze", 1000000000, "views", "2020-07-13", "src-pabst", "reported", "Reported by FaZe's revenue chief; treat the date as internal.");
  b.metric("m:yt-subs-1m", "Followers", "YouTube subscribers: 1 million", "ch:yt-faze", 1000000, "subscribers", "2012-10-08", "src-yt-faze", "reported", "Marked by the 1 Million Subscribers Teamtage.");
  b.metric("m:yt-subs-2m", "Followers", "YouTube subscribers: 2 million", "ch:yt-faze", 2000000, "subscribers", "2013-11-04", "src-yt-faze", "reported", "Marked by the 2 Million Subscribers Teamtage.");
  b.metric("m:yt-subs-3m", "Followers", "YouTube subscribers: 3 million", "ch:yt-faze", 3000000, "subscribers", "2015-11-05", "src-yt-faze", "reported", "Marked by the 3 Million Subscribers Teamtage.");
  b.metric("m:spac-target", "Valuation", "SPAC deal announced at about $1B", FC, 1000000000, "USD", "2021-10-25", "src-wikipedia", "reported", "Reported as the highest valuation for an esports company.");
  b.metric("m:spac-valuation", "Valuation", "SPAC valuation at listing", "org:faze-holdings", 725000000, "USD", "2022-07-19", "src-wikipedia", "reported", "Below the $1B target announced Oct 2021.");
  b.metric("m:gs-acquisition", "Valuation", "GameSquare acquisition price", "org:faze-holdings", 17000000, "USD", "2023-10-20", "src-gs-ir", "reported", "About 98% below the SPAC peak.");
  b.metric("m:kalish-investment", "Revenue", "Kalish investment for 49% of FaZe Media", FM, 11000000, "USD", "2024-05-16", "src-esportslegal", "reported");
  b.metric("m:fm-valuation", "Valuation", "FaZe Media implied valuation (2025 sale)", FM, 39200000, "USD", "2025-04-01", "src-gs-ir", "reported", "Banks paid $9.5M toward the 25.5% purchase.");
  b.metric("m:six-prize-2025", "Prize", "Six Invitational 2025 prize", "ev:six-inv-2025", 1000000, "USD", "2025-02-16", "src-liquipedia", "verified");
  b.metric("m:six-prize-2026", "Prize", "Six Invitational 2026 prize", "ev:six-inv-2026", 1000000, "USD", "2026-02-15", "src-liquipedia", "verified");
  b.metric("m:ewc-r6-prize", "Prize", "Esports World Cup 2026 R6 prize", "ev:ewc-r6-2026", 750000, "USD", "2026-08-15", "src-gs-ir", "verified");
  b.metric("m:pgl-prize", "Prize", "PGL Major Antwerp prize", "ev:pgl-2022", 500000, "USD", "2022-05-22", "src-liquipedia", "verified");
  b.metric("m:champion-sellout", "Purchases", "A later Champion drop sold out in 28 minutes", "prod:champion-hoodie", 28, "minutes to sell out", "2019-12-11", "src-wikipedia", "reported", "The timeline does not date the drop. Assigned to the 11 Dec 2019 collaboration, which is an assumption.");
  b.metric("m:rug-meetup", "Engagement", "Fans at the Santa Ana merch meetup", "prod:rug-merch", 7000, "fans", "2019-08-03", "src-pabst", "reported", "Police shut it down.");
  b.metric("m:subathon-claim", "Revenue", "Banks' claimed subathon haul", "camp:subathon-2024", 12000000, "USD (claimed)", "2024-10-03", "src-esportslegal", "disputed", "Claimed on a podcast, then walked back. Not an accepted figure.");
  // invented demo values: clearly mock, never shown as history
  b.metric("m:mock-merch-conv", "ConversionRate", "MOCK: merch conversion from esports-only fans", "cohort:esports-only", 0.018, "ratio", "2026-10-31", "src-demo-stream", "mock", "Invented for the demo. No such measurement exists.");
  b.metric("m:mock-nostalgia-sentiment", "Sentiment", "MOCK: nostalgia sentiment index", "cohort:og-trickshot", 0.71, "index 0-1", "2026-10-31", "src-demo-stream", "mock", "Invented for the demo.");
  b.metric("m:mock-merch-revenue", "Revenue", "MOCK: merchandise revenue, Q3 2026", "cohort:merch-buyers", 410000, "USD", "2026-10-31", "src-demo-stream", "mock", "Invented for the demo.");
  b.node("ev:rug-meetup-police", "event", "Police close the Rug merch meetup", { subtype: "Controversy", from: "2019-08-03", src: "src-pabst" });
}

function GS(): string { return "gamesquare-release-2024-05-16"; }
