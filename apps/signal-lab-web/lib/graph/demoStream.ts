import type { GraphEvent } from "./types";
import { DEMO_NOW } from "./temporal";

/**
 * A scripted stream of DEMO events. Every event has demo:true and sourceId "src-demo-stream", so the graph labels what
 * they create as mock. Times advance from the demo "now" so they stack after real history.
 */
const day = (n: number) => new Date(Date.parse(DEMO_NOW) + n * 864e5).toISOString().replace(".000Z", "Z");
const D = (id: string, type: GraphEvent["type"], at: string, payload: Record<string, unknown>): GraphEvent =>
  ({ id, type, at, demo: true, sourceId: "src-demo-stream", payload });

export const DEMO_EVENTS: GraphEvent[] = [
  D("d1", "creator_signed", day(1), { personId: "person:demo-newcomer", name: "Demo Creator “Nova”", role: "Creator", orgId: "org:faze-media", orgName: "FaZe Media" }),
  D("d2", "video_published", day(2), { id: "c:demo-trick-1", name: "DEMO: Nova's first trickshot montage", creatorId: "person:demo-newcomer", channelId: "ch:yt-faze", views: 120_000 }),
  D("d3", "stream_live", day(3), { id: "c:demo-live-1", name: "DEMO: Kaysan CoD scrims live", creatorId: "person:kaysan", channelId: "ch:twitch-faze", views: 8_400 }),
  D("d4", "campaign_launched", day(4), { id: "camp:demo-drop", name: "DEMO: Nostalgia merch drop", brandId: "brand:champion", orgId: "org:faze-media" }),
  D("d5", "tournament_won", day(5), { id: "ev:demo-cs-win", name: "DEMO: FaZe wins a CS2 Cup", teamId: "team:cs2", prize: 150_000 }),
  D("d6", "metric_updated", day(6), { subjectId: "c:demo-trick-1", label: "DEMO: Nova's montage views", value: 410_000, kind: "Views", unit: "views" }),
  D("d7", "creator_departed", day(7), { personId: "person:demo-newcomer", name: "Demo Creator “Nova”" }),
];
