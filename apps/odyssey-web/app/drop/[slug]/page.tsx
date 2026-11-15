"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
} from "lucide-react";
import { api, getToken, ODY, signIn } from "@/lib/api";
import { media, stateLabels } from "@/lib/content";
import { MediaFrame } from "@/components/MediaFrame";
import { SubmissionForm } from "@/components/SubmissionForm";
type Finalist = {
  entry_id: string;
  label: string;
  handle: string;
  playback_url: string | null;
  marker_ms: number;
};
type Campaign = {
  title: string;
  state: string;
  slug: string;
  reference: { playback_url: string | null };
  ballot: { id: string; state: string; closes_at: string } | null;
  finalists: Finalist[];
  episode_slug: string | null;
};
const examples: Finalist[] = [
  {
    entry_id: "example-a",
    label: "A",
    handle: "yournamehere",
    playback_url: null,
    marker_ms: 0,
  },
  {
    entry_id: "example-b",
    label: "B",
    handle: "nextgeneration",
    playback_url: null,
    marker_ms: 0,
  },
];
export default function Drop({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [offline, setOffline] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [index, setIndex] = useState(0);
  const [mine, setMine] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<Campaign>(`/v1/campaigns/${slug}`);
      if (r.status === 200) {
        setCampaign(r.body);
        setOffline(false);
        setNotFound(false);
      } else if (r.status === 404) {
        setNotFound(true);
      } else setOffline(true);
    } catch {
      setOffline(true);
    }
  }, [slug]);
  useEffect(() => {
    load();
    const update = () => setSignedIn(!!getToken());
    update();
    window.addEventListener("faze-auth", update);
    return () => window.removeEventListener("faze-auth", update);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!campaign || offline) return;
    const es = new EventSource(`${ODY}/v1/stream/campaigns/${slug}`);
    es.addEventListener("state", load);
    return () => es.close();
  }, [slug, !!campaign, offline, load]);
  useEffect(() => {
    if (!signedIn || !campaign?.ballot?.id) {
      setMine(null);
      return;
    }
    api<{ entry_id: string | null }>(`/v1/ballots/${campaign.ballot.id}/me`)
      .then((r) => {
        if (r.status === 200) setMine(r.body.entry_id);
      })
      .catch(() => {});
  }, [signedIn, campaign?.ballot?.id]);
  const finalists = campaign?.finalists.length ? campaign.finalists : examples;
  const active = finalists[index % finalists.length];
  const isExample = !campaign?.finalists.length;
  const expired =
    !!campaign?.ballot?.closes_at &&
    now !== null &&
    new Date(campaign.ballot.closes_at).getTime() <= now;
  const open =
    campaign?.state === "voting" &&
    campaign.ballot?.state === "open" &&
    !expired &&
    !offline;
  const remaining =
    campaign?.ballot?.closes_at && now
      ? Math.max(0, new Date(campaign.ballot.closes_at).getTime() - now)
      : null;
  const date = campaign?.ballot?.closes_at
    ? new Date(campaign.ballot.closes_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  async function vote(f: Finalist) {
    if (!open || !campaign?.ballot || isExample) return;
    setBusy(true);
    setMessage("");
    try {
      if (!getToken()) {
        await signIn("fan-ava");
        setSignedIn(true);
      }
      const r = await api<{ title?: string }>(
        `/v1/ballots/${campaign.ballot.id}/votes`,
        { method: "POST", body: JSON.stringify({ entry_id: f.entry_id }) },
      );
      if (r.status < 300) {
        setMine(f.entry_id);
        setMessage("Vote recorded");
      } else {
        setMessage(
          r.status === 409
            ? "Voting has closed. The final cut is coming next."
            : r.status === 429
              ? "A little too fast. Wait a moment and try again."
              : (r.body.title ?? "Your vote could not be recorded."),
        );
        if (r.status === 409) load();
      }
    } catch {
      setMessage(
        "We couldn’t connect. Your vote has not been recorded. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    const url = `${window.location.origin}/make-the-cut/${slug}?entry=${active.entry_id}#community`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Entry link copied");
    } catch {
      setMessage(`Share this entry: ${url}`);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("entry");
    const i = campaign?.finalists.findIndex((f) => f.entry_id === id);
    if (i !== undefined && i >= 0) setIndex(i);
  }, [campaign?.finalists]);
  if (notFound || (offline && slug !== "homecoming-week1"))
    return (
      <div className="page-shell empty-page">
        <p className="eyebrow red">CAMPAIGN NOT FOUND</p>
        <h1>ANOTHER WAY IN.</h1>
        <p>This campaign isn’t available. Explore the current challenge instead.</p>
        <Link className="button primary" href="/make-the-cut">
          Browse campaigns <ArrowRight />
        </Link>
      </div>
    );
  return (
    <div className="campaign-page">
      <div className="page-shell">
        <div className="page-kicker">
          <Link href="/make-the-cut">
            <ArrowLeft size={13} /> MAKE THE CUT
          </Link>
          <span data-testid="state">
            {campaign
              ? (stateLabels[campaign.state] ?? campaign.state)
              : offline
                ? "CAMPAIGN PREVIEW"
                : "CONNECTING TO CAMPAIGN…"}
          </span>
        </div>
        <section className="shot-hero">
          <div className="shot-copy">
            <p className="eyebrow red">HOMECOMING / RECREATE THE SHOT</p>
            <h1>
              THE
              <br />
              TEMPERRR
              <br />
              <em>SHOT.</em>
            </h1>
            <p>
              One rooftop. One impossible moment.
              <br />
              Now it’s your turn.
            </p>
            <div className="shot-jumps">
              <a className="button primary" href="#community">
                See the recreations <ArrowDown size={18} />
              </a>
              <a href="#catch-up" className="text-link">
                New to this shot? <ArrowDown size={15} />
              </a>
            </div>
          </div>
          <div className="shot-original">
            <MediaFrame
              src={campaign?.reference.playback_url || media.reference.src}
              poster={media.reference.poster}
              youtube={media.reference.youtube}
              title="The original Temperrr Shot"
              caption="THE ORIGINAL · FAZE TEMPERRR · MODERN WARFARE 2"
            />
          </div>
        </section>
        {offline && (
          <div className="connection-note">
            Campaign preview · live voting is unavailable until the campaign
            service connects.{" "}
            <button onClick={load}>Try connection again ↗</button>
          </div>
        )}
        <div className="campaign-facts">
          <span>01 / WATCH THE ORIGINAL</span>
          <span>02 / MAKE IT YOUR OWN</span>
          <span>03 / LET THE COMMUNITY CALL IT</span>
        </div>
      </div>
      <section id="catch-up" className="tutorial-section">
        <div className="page-shell tutorial-grid">
          <div>
            <p className="eyebrow red">CATCH ME UP / THE BREAKDOWN</p>
            <h2>
              HOW DID
              <br />
              HE <em>DO IT?</em>
            </h2>
            <p>
              The controller cam. The rooftop. The move that became a reference
              point. Watch the official FaZe tutorial, then see how today’s
              players bring it back.
            </p>
            <a className="text-link" href="#community">
              Community recreations <ArrowDown size={18} />
            </a>
          </div>
          <MediaFrame
            poster={media.tutorial.poster}
            youtube={media.tutorial.youtube}
            title="Official FaZe Temperrr Shot tutorial"
            caption="LEARN THE MOVE · OFFICIAL FAZE TUTORIAL"
          />
        </div>
      </section>
      <div className="page-shell">
        <section id="community" className="community-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow red">SAME MOMENT. NEW GENERATION.</p>
              <h2>COMMUNITY RECREATIONS</h2>
            </div>
            <span className="eyebrow">
              {isExample
                ? "GALLERY PREVIEW / ILLUSTRATIVE ENTRIES"
                : `${finalists.length} EDITORIALLY SELECTED FINALISTS`}
            </span>
          </div>
          <div className="gallery-layout">
            <MediaFrame
              key={active.entry_id}
              poster={
                index % 2 ? media.nightshift.poster : media.rooftop.poster
              }
              src={active.playback_url}
              title={
                isExample
                  ? "Community recreation placeholder"
                  : `Recreation by ${active.handle}`
              }
              caption={
                isExample
                  ? "PLACEHOLDER · YOUR APPROVED ENTRIES WILL APPEAR HERE"
                  : `CLIP ${active.label} · ${active.handle}`
              }
            />
            <div className="creator-panel">
              <div className="gallery-controls">
                <span>
                  {String((index % finalists.length) + 1).padStart(2, "0")}{" "}
                  <i>/ {String(finalists.length).padStart(2, "0")}</i>
                </span>
                <div>
                  <button
                    aria-label="Previous recreation"
                    onClick={() =>
                      setIndex(
                        (index - 1 + finalists.length) % finalists.length,
                      )
                    }
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    aria-label="Next recreation"
                    onClick={() => setIndex((index + 1) % finalists.length)}
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
              <p className="eyebrow red">
                {isExample
                  ? "YOUR PLACE IN THE STORY"
                  : `FINALIST / CLIP ${active.label}`}
              </p>
              <h3>@{active.handle.replace(/^@/, "")}</h3>
              <p>
                {isExample
                  ? "This could be your recreation. Your clip, your credit, and a shot at the next community cut."
                  : "A new take on an original moment. Watch the recreation, then back the clip you want in the community cut."}
              </p>
              <button
                className="button primary"
                data-vote={active.entry_id}
                disabled={!open || busy || isExample}
                onClick={() => vote(active)}
              >
                {mine === active.entry_id ? (
                  <>
                    <Check size={18} /> Your pick
                  </>
                ) : busy ? (
                  "Recording…"
                ) : (
                  `Vote for ${active.label}`
                )}
                <ArrowRight size={18} />
              </button>
              {!isExample && (
                <button className="text-link share-link" onClick={share}>
                  Share this recreation <Copy size={14} />
                </button>
              )}
              <p className="subtle-note">
                {isExample
                  ? "Preview entries aren’t real submissions and cannot receive votes."
                  : open
                    ? "One current vote per fan. Change your pick until the ballot closes."
                    : "Voting is closed or hasn’t opened yet. You can still watch the clips."}
              </p>
              {remaining !== null && (
                <div className="deadline">
                  <span className="eyebrow">
                    {expired ? "VOTING CLOSED" : "VOTING ENDS IN"}
                  </span>
                  <strong>
                    {expired
                      ? "THE NEXT CUT IS COMING"
                      : `${Math.floor(remaining / 86400000)}D : ${String(Math.floor(remaining / 3600000) % 24).padStart(2, "0")}H : ${String(Math.floor(remaining / 60000) % 60).padStart(2, "0")}M`}
                  </strong>
                  <small>{date}</small>
                </div>
              )}
            </div>
          </div>
          <p id="result" role="status" className="vote-message">
            {message}
          </p>
          {campaign?.episode_slug && (
            <Link
              href={`/final-cut/${campaign.episode_slug}`}
              className="button outline"
            >
              Watch the Final Cut <ArrowRight size={20} />
            </Link>
          )}
        </section>
        <SubmissionForm
          slug={slug}
          accepting={!campaign || campaign.state === "accepting_entries"}
        />
      </div>
    </div>
  );
}
