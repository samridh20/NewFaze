"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Sparkles, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { HlsPlayer } from "@/components/HlsPlayer";

export default function FinalCut({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [ep, setEp] = useState<any>(null);
  const [status, setStatus] = useState(0);
  const [part, setPart] = useState(0);
  useEffect(() => { api(`/v1/episodes/${slug}`).then((r) => { setStatus(r.status); setEp(r.body); }); api(`/v1/episodes/${slug}/views`, { method: "POST" }); }, [slug]);
  if (!status) return <div className="pt-20 text-center text-white/40">Loading…</div>;
  if (status !== 200) return <div className="pt-20 text-center text-white/55">Not published yet.</div>;
  const labels = ep.real.labels ?? {}, tally: Record<string, number> = ep.real.tally ?? {};
  const total = Object.values(tally).reduce((a, b) => a + Number(b), 0);
  const playable = ep.sequence.filter((p: any) => p.playback_url);
  const svf = ep.sim_vs_fans;
  const winner = ep.credits.find((c: any) => c.role === "winner");
  return (
    <div className="pt-8">
      <Link href="/" className="text-sm text-white/45 hover:text-white">← Lobby</Link>
      <p className="mt-4 text-xs font-bold uppercase tracking-[.3em] text-faze-red">Final Cut</p>
      <h1 data-testid="episode-title" className="mt-2 text-3xl font-black md:text-5xl">{ep.title}: Final Cut</h1>
      {winner && <p className="mt-2 flex items-center gap-2 text-lg text-white/75"><Trophy size={18} className="text-amber-300" /> Winner: <b>@{winner.handle}</b></p>}

      <div className="mt-6 overflow-hidden rounded-3xl glass">
        <div className="aspect-video bg-black"><HlsPlayer key={part} src={playable[part]?.playback_url ?? null} autoPlay className="h-full w-full" onEnded={() => setPart((p) => Math.min(p + 1, playable.length - 1))} label="Final Cut" /></div>
        <div data-testid="sequence" className="flex gap-2 overflow-x-auto p-3">
          {playable.map((p: any, i: number) => (
            <button key={i} onClick={() => setPart(i)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase ${i === part ? "bg-faze-red" : "chip"}`}>{p.kind.replace("_", " ")}</button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div data-testid="real-tally" className="rounded-3xl p-6 glass">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/45">Real result</h3>
          <div className="mt-4 space-y-4">
            {Object.entries(tally).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm font-semibold"><span>Clip {labels[k] ?? k}: {v} votes</span><span>{total ? Math.round((Number(v) / total) * 100) : 0}%</span></div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${total ? (Number(v) / total) * 100 : 0}%` }} className="h-full rounded-full bg-faze-red" /></div>
              </div>
            ))}
          </div>
        </div>
        {svf && (
          <div data-testid="sim-vs-fans" className="rounded-3xl p-6 glass">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/45"><Sparkles size={13} /> Sim vs Fans</h3>
              <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">simulated · uncalibrated</span>
            </div>
            <div className="mt-4 space-y-4">
              {Object.keys(svf.predicted).map((k) => {
                const sim = svf.predicted[k] * 100, real = total ? (Number(svf.real[k]) / total) * 100 : 0;
                return (
                  <div key={k}>
                    <div className="text-sm font-semibold">Clip {labels[k] ?? k}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50"><span className="w-14">simulated</span><div className="h-2 flex-1 rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${sim}%` }} className="h-2 rounded-full bg-amber-300" /></div><span className="w-9 text-right">{sim.toFixed(0)}%</span></div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50"><span className="w-14">fans</span><div className="h-2 flex-1 rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${real}%` }} className="h-2 rounded-full bg-faze-red" /></div><span className="w-9 text-right">{real.toFixed(0)}%</span></div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-white/40">The simulated prediction was locked as a hash before voting closed, so it could not be changed after the result.</p>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-3xl p-6 glass">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/45">Credits</h3>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {ep.credits.map((c: any) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl px-4 py-3 chip">
              <span><span className="text-xs uppercase text-white/40">{c.role}</span> <b className="ml-2">@{c.handle}</b></span>
              {c.channel_url && <a href={c.channel_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-faze-red">Channel <ExternalLink size={13} /></a>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
