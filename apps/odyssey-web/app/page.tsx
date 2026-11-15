"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Flame, Timer } from "lucide-react";
import { api } from "@/lib/api";

const STATE_LABEL: Record<string, string> = { voting: "Voting open", accepting_entries: "Entries open", shortlist_locked: "Finalists locked", closed: "Voting closed", published: "Final Cut out", scheduled: "Coming soon" };

export default function Lobby() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/v1/lobby").then((r) => setD(r.body)); }, []);
  const w = d?.this_week, l = d?.last_final_cut;
  return (
    <div className="pt-10">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-faze-red">Season: Homecoming</p>
        <h1 className="mt-3 text-5xl font-black uppercase italic leading-[.95] tracking-tight md:text-7xl">You make<br /><span className="text-faze-red">the cut.</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-white/60">Every week FaZe drops a challenge. Fans send in clips, everyone votes, and the winner lands in the Final Cut.</p>
      </motion.section>

      {w && (
        <motion.div data-testid="this-week" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}
          className="relative mt-10 overflow-hidden rounded-3xl p-6 glass md:p-8">
          <div className="absolute inset-x-0 top-0 h-1.5 faze-stripe" />
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-faze-red/15 px-3 py-1 text-xs font-semibold text-faze-red"><Flame size={13} /> This week · {STATE_LABEL[w.state] ?? w.state}</span>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">{w.title}</h2>
              <p className="mt-2 text-white/55">Recreate the shot. Two finalists. One makes the Final Cut.</p>
            </div>
            <Link href={`/drop/${w.slug}`} className="inline-flex items-center gap-2 self-start rounded-2xl bg-faze-red px-6 py-3.5 font-bold shadow-lg shadow-red-700/40 transition hover:brightness-110 md:self-auto">
              Open the Drop <ArrowRight size={18} />
            </Link>
          </div>
        </motion.div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div data-testid="last-final-cut" className="rounded-3xl p-6 glass">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/45"><Clapperboard size={14} /> Latest Final Cut</div>
          {l ? (<><h3 className="mt-3 text-xl font-bold">{l.title}</h3><Link href={`/final-cut/${l.slug}`} className="mt-4 inline-flex items-center gap-1 text-faze-red hover:underline">Watch it <ArrowRight size={15} /></Link></>)
            : <p className="mt-3 text-white/45">The first Final Cut drops after this week's vote.</p>}
        </div>
        <div className="rounded-3xl p-6 glass">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/45"><Timer size={14} /> Next drop</div>
          <p className="mt-3 text-white/60">{d?.next_drop ? d.next_drop.title : "Announced when this week's Final Cut is out."}</p>
        </div>
      </div>
    </div>
  );
}
