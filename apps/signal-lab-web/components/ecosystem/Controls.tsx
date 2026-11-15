"use client";
import { useId, useState } from "react";
import { Pause, Play, RotateCcw, Search, SkipForward, X } from "lucide-react";
import { LAYERS, type EventLogEntry, type Layer, type SearchHit, type ViewMode } from "@/lib/graph/types";
import { LAYER_COLORS } from "@/lib/graph/view";
import { fmtDate } from "@/lib/graph/temporal";

export function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const items: { id: ViewMode; label: string; hint: string }[] = [
    { id: "observed", label: "Observed", hint: "Facts and measurements from sources" },
    { id: "simulation", label: "Simulation", hint: "MiroFish predictions only" },
    { id: "compare", label: "Compare", hint: "Both, simulated shown dashed" },
  ];
  return (
    <div role="radiogroup" aria-label="Graph mode" className="flex rounded-xl p-1 chip">
      {items.map((i) => (
        <button key={i.id} role="radio" aria-checked={mode === i.id} title={i.hint} onClick={() => onChange(i.id)}
          className={`rounded-lg px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-faze-red ${mode === i.id ? (i.id === "observed" ? "bg-white/12 text-white" : "bg-amber-400/20 text-amber-100") : "text-white/55 hover:text-white"}`}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function LayerFilters({ layers, counts, onToggle }: { layers: ReadonlySet<Layer>; counts: Record<Layer, number>; onToggle: (l: Layer) => void }) {
  return (
    <div role="group" aria-label="Layer filters" className="flex flex-wrap gap-1.5">
      {LAYERS.map((l) => {
        const on = layers.has(l.id);
        return (
          <button key={l.id} aria-pressed={on} onClick={() => onToggle(l.id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-faze-red ${on ? "text-white" : "text-white/40"}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? LAYER_COLORS[l.id] : "transparent", border: `1.5px solid ${LAYER_COLORS[l.id]}` }} />
            {l.label} <span className="text-white/35">{counts[l.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

const START = { y: 2010, m: 4 }; // May 2010
export const monthCount = (nowIso: string) => { const d = new Date(nowIso); return (d.getUTCFullYear() - START.y) * 12 + d.getUTCMonth() - START.m; };
export const monthToAsOf = (i: number) => { const t = Date.UTC(START.y, START.m + i + 1, 1) - 1000; return new Date(t).toISOString().replace(".000Z", "Z"); };
const monthLabel = (i: number) => fmtDate(new Date(Date.UTC(START.y, START.m + i, 1)).toISOString(), "month");

export function TimeControls({ asOf, nowIso, onChange, lastIndex }: { asOf: string | "current"; nowIso: string; onChange: (a: string | "current") => void; lastIndex: number }) {
  const id = useId();
  const idx = asOf === "current" ? lastIndex : Math.min(lastIndex, Math.max(0, monthCount(asOf)));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-xs uppercase tracking-widest text-white/45">As of</label>
      <input id={id} type="range" min={0} max={lastIndex} step={1} value={idx} aria-valuetext={asOf === "current" ? "Current" : monthLabel(idx)}
        onChange={(e) => onChange(Number(e.target.value) >= lastIndex ? "current" : monthToAsOf(Number(e.target.value)))}
        className="h-1.5 min-w-[260px] flex-1 accent-[#e4002b]" />
      <span data-testid="asof" className="w-28 text-sm font-medium tabular-nums">{asOf === "current" ? "Current" : monthLabel(idx)}</span>
      <div className="flex gap-1">
        {[2010, 2014, 2018, 2022, 2024, 2026].map((y) => {
          const i = (y - START.y) * 12 - START.m + 11;
          return <button key={y} onClick={() => onChange(i >= lastIndex ? "current" : monthToAsOf(Math.max(0, i)))} className="rounded-md px-2 py-0.5 text-[11px] text-white/55 chip hover:text-white">{y}</button>;
        })}
        <button onClick={() => onChange("current")} aria-pressed={asOf === "current"} className={`rounded-md px-2 py-0.5 text-[11px] chip ${asOf === "current" ? "!border-faze-red/70 text-white" : "text-white/55"}`}>Current ({fmtDate(nowIso, "month")})</button>
      </div>
    </div>
  );
}

export function SearchBox({ onSearch, hits, onPick, ambiguous }: { onSearch: (q: string) => void; hits: SearchHit[]; onPick: (id: string) => void; ambiguous: boolean }) {
  const [q, setQ] = useState("");
  const listId = useId();
  return (
    <div className="relative min-w-[260px]">
      <label className="flex items-center gap-2 rounded-xl px-3 py-2 chip focus-within:!border-faze-red/70">
        <Search size={14} className="text-white/45" />
        <input value={q} onChange={(e) => { setQ(e.target.value); onSearch(e.target.value); }} aria-label="Search creators, players, teams, games, sponsors, campaigns and content"
          aria-controls={listId} aria-expanded={hits.length > 0} placeholder="Search a creator, team, sponsor, alias…" className="w-full bg-transparent text-sm outline-none placeholder:text-white/35" />
        {q && <button aria-label="Clear search" onClick={() => { setQ(""); onSearch(""); }}><X size={13} className="text-white/45" /></button>}
      </label>
      {hits.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl py-1 glass shadow-2xl">
          {ambiguous && <li className="px-3 py-1 text-[11px] text-amber-300">“{q}” matches more than one entity. Pick one.</li>}
          {hits.map((h) => (
            <li key={h.node.id} role="option" aria-selected={false}>
              <button onClick={() => { onPick(h.node.id); setQ(""); onSearch(""); }} className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-white/8 focus-visible:bg-white/10">
                <span className="text-sm">{h.node.name}</span>
                <span className="text-[11px] text-white/45">{h.node.category.replace("_", " ")}{h.matchedAlias ? ` · matched alias “${h.matchedAlias}”` : ""}{h.node.disambiguation ? ` · ${h.node.disambiguation}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LiveControls({ playing, onToggle, onStep, onReset, log, remaining }: { playing: boolean; onToggle: () => void; onStep: () => void; onReset: () => void; log: EventLogEntry[]; remaining: number }) {
  const last = log[log.length - 1];
  return (
    <div className="rounded-xl p-3 glass" aria-label="Live demo stream">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">Demo stream</span>
        <button onClick={onToggle} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs chip" aria-pressed={playing}>{playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}</button>
        <button onClick={onStep} disabled={remaining === 0} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs chip disabled:opacity-40"><SkipForward size={12} /> Next event</button>
        <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs chip"><RotateCcw size={12} /> Reset</button>
        <span className="text-[11px] text-white/45" data-testid="last-update">{last ? `Last update ${fmtDate(last.event.at)} (demo)` : "No demo events applied yet"} · {remaining} queued</span>
      </div>
      {log.length > 0 && (
        <ol className="mt-2 space-y-0.5 text-[11px] text-white/60" aria-live="polite">
          {log.slice(-4).reverse().map((e) => <li key={e.event.id}><span className="text-white/35">{fmtDate(e.event.at)}</span> {e.summary}</li>)}
        </ol>
      )}
    </div>
  );
}
