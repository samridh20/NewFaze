"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Lock, Play, Radio, Timer, Trophy } from "lucide-react";
import { api, getToken, ODY, signIn } from "@/lib/api";
import { HlsPlayer, PlayerHandle } from "@/components/HlsPlayer";

function useCountdown(to?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return { d, h, m, s, done: ms === 0 };
}

export default function Drop({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [c, setC] = useState<any>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [signedIn, setSignedIn] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const players = useRef<Record<string, PlayerHandle | null>>({});

  const load = useCallback(async () => { const r = await api(`/v1/campaigns/${slug}`); setC(r.body); }, [slug]);
  useEffect(() => { load(); setSignedIn(!!getToken()); const u = () => setSignedIn(!!getToken()); window.addEventListener("faze-auth", u); return () => window.removeEventListener("faze-auth", u); }, [load]);
  useEffect(() => {  // live state over SSE
    const es = new EventSource(`${ODY}/v1/stream/campaigns/${slug}`);
    es.addEventListener("state", () => load());
    return () => es.close();
  }, [slug, load]);
  useEffect(() => {
    if (!signedIn || !c?.ballot?.id) return;
    api(`/v1/ballots/${c.ballot.id}/me`).then((r) => r.status === 200 && setMine(r.body.entry_id ?? null));
  }, [signedIn, c?.ballot?.id]);

  const cd = useCountdown(c?.ballot?.closes_at);
  const open = c?.ballot?.state === "open";

  function syncPlay() {  // play both finalists from the marker together
    Object.values(players.current).forEach((p) => { const v = p?.video; if (v) { v.currentTime = 0; v.play().catch(() => {}); } });
  }
  async function vote(entry: string, label: string) {
    if (!getToken()) { setMsg("Sign in first"); return; }
    setVoting(entry);
    const r = await api(`/v1/ballots/${c.ballot.id}/votes`, { method: "POST", body: JSON.stringify({ entry_id: entry }) });
    setVoting(null);
    if (r.status < 300) { setMine(entry); setMsg("Vote recorded"); } else setMsg(`Vote refused: ${r.body.title ?? r.status}`);
  }

  if (!c) return <div className="pt-20 text-center text-white/40">Loading the drop…</div>;
  return (
    <div className="pt-8">
      <Link href="/" className="text-sm text-white/45 hover:text-white">← Lobby</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${open ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/70"}`}>
            {open ? <Radio size={12} className="animate-pulse" /> : <Lock size={12} />} <span data-testid="state">State: {c.ballot?.state ?? c.state}</span>
          </span>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">{c.title}</h1>
        </div>
        {open && cd && (
          <div className="flex gap-2 text-center">
            {[["d", cd.d], ["h", cd.h], ["m", cd.m], ["s", cd.s]].map(([k, v]) => (
              <div key={k as string} className="w-16 rounded-xl py-2 glass"><div className="text-2xl font-black tabular-nums">{String(v).padStart(2, "0")}</div><div className="text-[10px] uppercase text-white/40">{k}</div></div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={syncPlay} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm chip"><Play size={14} /> Synced replay (both clips)</button>
        {!signedIn && open && <button onClick={() => signIn("fan-ava")} className="rounded-xl bg-faze-red px-4 py-2 text-sm font-semibold">Sign in to vote</button>}
        {c.episode_slug && <Link href={`/final-cut/${c.episode_slug}`} className="inline-flex items-center gap-2 rounded-xl bg-faze-red px-4 py-2 text-sm font-semibold"><Trophy size={14} /> Watch the Final Cut</Link>}
      </div>

      <div id="finalists" className="mt-6 grid gap-6 md:grid-cols-2">
        {(c.finalists ?? []).map((f: any) => {
          const picked = mine === f.entry_id;
          return (
            <motion.div key={f.entry_id} layout className={`overflow-hidden rounded-3xl glass transition ${picked ? "ring-2 ring-faze-red" : ""}`}>
              <div className="relative aspect-video bg-black">
                <HlsPlayer ref={(p) => { players.current[f.label] = p; }} src={f.playback_url} className="h-full w-full object-cover" label={`Clip ${f.label}`} />
                <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-sm font-black">CLIP {f.label}</span>
              </div>
              <div className="flex items-center justify-between p-5">
                <div><div className="font-bold">@{f.handle}</div><div className="text-xs text-white/45">Marker at {(f.marker_ms / 1000).toFixed(1)}s</div></div>
                <button data-vote={f.entry_id} disabled={!open || voting !== null} onClick={() => vote(f.entry_id, f.label)}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold transition disabled:opacity-50 ${picked ? "bg-white text-black" : "bg-faze-red hover:brightness-110"}`}>
                  {picked ? <><Check size={16} /> Your pick</> : <>Vote for {f.label}</>}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>{msg && <motion.p id="result" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-center text-sm text-white/70">{msg}</motion.p>}</AnimatePresence>
      <p className="mt-6 text-center text-xs text-white/35">Vote totals stay hidden until the ballot closes. You can change your vote while it's open.</p>
    </div>
  );
}
