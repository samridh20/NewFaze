"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { HlsPlayer } from "@/components/HlsPlayer";
import { campaignHref, media } from "@/lib/content";
type Credit = {
  id: string;
  handle: string;
  role: string;
  channel_url: string | null;
};
type Episode = {
  title: string;
  campaign_slug: string;
  published_at: string;
  credits: Credit[];
  sequence: { kind: string; playback_url: string | null }[];
  real: { labels: Record<string, string>; tally: Record<string, number> };
  sim_vs_fans: {
    predicted: Record<string, number>;
    real: Record<string, number>;
  } | null;
};
export default function FinalCut({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [status, setStatus] = useState("loading");
  const [part, setPart] = useState(0);
  useEffect(() => {
    let active = true;
    api<Episode>(`/v1/episodes/${slug}`)
      .then((r) => {
        if (!active) return;
        if (r.status === 200) {
          setEpisode(r.body);
          setStatus("ready");
          api(`/v1/episodes/${slug}/views`, { method: "POST" }).catch(() => {});
        } else setStatus(r.status === 404 ? "unpublished" : "offline");
      })
      .catch(() => {
        if (active) setStatus("offline");
      });
    return () => {
      active = false;
    };
  }, [slug]);
  if (!episode)
    return (
      <div className="page-shell empty-page">
        <p className="eyebrow red">
          THE FINAL CUT / {status === "loading" ? "LOADING" : "THE NEXT FRAME"}
        </p>
        <h1>
          {status === "loading"
            ? "GETTING THE CUT."
            : status === "unpublished"
              ? "THE STORY ISN’T\nFINISHED YET."
              : "THE CUT IS\nOFFLINE."}
        </h1>
        <p>
          {status === "loading"
            ? "Checking for the published episode…"
            : status === "unpublished"
              ? "This episode hasn’t been published yet. Explore the current campaign while you wait."
              : "We couldn’t reach the episode service. Try again when it’s connected."}
        </p>
        <Link href={campaignHref} className="button primary">
          Back to the campaign <ArrowRight size={20} />
        </Link>
      </div>
    );
  const playable = episode.sequence.filter((p) => p.playback_url);
  const winner = episode.credits.find((c) => c.role === "winner");
  const total = Object.values(episode.real.tally).reduce(
    (sum, value) => sum + value,
    0,
  );
  const sim = episode.sim_vs_fans;
  const channel = (url: string | null) => {
    try {
      const parsed = new URL(url ?? "");
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  };
  return (
    <div className="page-shell release-page">
      <div className="page-kicker">
        <Link href={`/make-the-cut/${episode.campaign_slug}`}>
          <ArrowLeft size={13} /> BACK TO THE CAMPAIGN
        </Link>
        <span>
          PUBLISHED / {new Date(episode.published_at).toLocaleDateString()}
        </span>
      </div>
      <h1 className="release-title" data-testid="episode-title">
        {episode.title}
        <span className="red">.</span>
      </h1>
      <div className="release-grid">
        <div>
          <div className="media-frame">
            {playable.length ? (
              <HlsPlayer
                key={part}
                src={playable[part]?.playback_url ?? null}
                poster={media.nightshift.poster}
                className="media-video"
                onEnded={() =>
                  setPart((p) => Math.min(p + 1, playable.length - 1))
                }
                autoPlay={part > 0}
                label="Final Cut"
              />
            ) : (
              <div className="media-placeholder">
                <p>The episode is published.</p>
                <small>Playable footage is not available yet.</small>
              </div>
            )}
          </div>
          <div
            className="sequence-tabs"
            data-testid="sequence"
            aria-label="Episode sequence"
          >
            {playable.map((p, i) => (
              <button
                key={i}
                onClick={() => setPart(i)}
                aria-pressed={part === i}
              >
                {String(i + 1).padStart(2, "0")} / {p.kind.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <aside className="release-sidebar">
          <p className="eyebrow red">THE COMMUNITY MADE THE CALL.</p>
          <h2>
            THE FINAL
            <br />
            FRAME IS
            <br />
            <em>FILLED.</em>
          </h2>
          {winner && (
            <p>
              <Trophy size={18} /> Final clip by{" "}
              <strong>@{winner.handle}</strong>
            </p>
          )}
          <p>
            A community choice. A permanent credit. Another chapter in the
            story.
          </p>
          <Link className="button primary" href="/archive">
            Into the archive <ArrowRight size={18} />
          </Link>
          <p className="eyebrow" style={{ marginTop: 30 }}>
            UP NEXT / THE ROTATION
          </p>
          <Link href="/make-the-cut#upcoming">
            <img
              src={media.antwerp.poster}
              alt="Illustrative next campaign artwork"
            />
            <h2>
              CALL THE PLAY <ArrowUpRight size={24} />
            </h2>
          </Link>
        </aside>
      </div>
      <div className="release-results">
        <section className="result-panel" data-testid="real-tally">
          <p className="eyebrow red">THE OFFICIAL BALLOT</p>
          <h3>THE FANS CALLED IT.</h3>
          {Object.entries(episode.real.tally).map(([key, value]) => (
            <div key={key}>
              <div className="tally-row">
                <span>
                  Clip {episode.real.labels[key] ?? key}: {value} votes
                </span>
                <span>{total ? Math.round((value / total) * 100) : 0}%</span>
              </div>
              <div className="tally-track">
                <span
                  style={{ width: `${total ? (value / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
          {!total && (
            <p className="subtle-note">
              No votes were recorded for this ballot.
            </p>
          )}
        </section>
        {sim && (
          <section className="result-panel" data-testid="sim-vs-fans">
            <h3>SIM VS FANS</h3>
            <p className="sim-note">
              simulated · uncalibrated · experimental comparison
            </p>
            {Object.entries(sim.predicted).map(([key, value]) => (
              <div className="tally-row" key={key}>
                <span>Clip {episode.real.labels[key] ?? key}</span>
                <span>
                  Simulation {Math.round(value * 100)}% / Fans{" "}
                  {total ? Math.round(((sim.real[key] ?? 0) / total) * 100) : 0}
                  %
                </span>
              </div>
            ))}
            <p className="subtle-note">
              A synthetic prediction, kept separate from the real ballot
              results.
            </p>
          </section>
        )}
      </div>
      <p className="eyebrow red">MADE BY THE COMMUNITY</p>
      <h2 className="release-section-heading">ROLL THE CREDITS.</h2>
      <ul className="credits-list">
        {episode.credits.map((c) => {
          const url = channel(c.channel_url);
          return (
            <li key={c.id}>
              <div>
                <small>{c.role}</small>
                <b>@{c.handle}</b>
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link"
                  onClick={() => {
                    api("/v1/credits/click", {
                      method: "POST",
                      body: JSON.stringify({ credit_id: c.id }),
                    }).catch(() => {});
                  }}
                >
                  Creator channel <ArrowUpRight size={16} />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
