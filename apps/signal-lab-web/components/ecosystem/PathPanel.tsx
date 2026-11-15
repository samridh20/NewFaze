"use client";
import { ArrowRight, Route, X } from "lucide-react";
import type { PathResult } from "@/lib/graph/pathfinding";
import type { ViewNode } from "@/lib/graph/view";
import { CATEGORY_LABEL } from "@/lib/graph/view";
import { StatusBadge } from "./badges";

interface Props {
  from: ViewNode | null; to: ViewNode | null; nodes: Map<string, ViewNode>; result: PathResult | null; searched: boolean;
  onFind: () => void; onNearestAudience: () => void; onNearestRevenue: () => void; onClear: () => void; onSelect: (id: string) => void; canSearch: boolean;
}

export function PathPanel({ from, to, nodes, result, searched, onFind, onNearestAudience, onNearestRevenue, onClear, onSelect, canSearch }: Props) {
  return (
    <section className="rounded-2xl p-4 glass" aria-label="Find connection">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Route size={15} className="text-faze-red" /> Find connection</h2>
        {(from || to || result) && <button onClick={onClear} aria-label="Clear path" className="rounded-lg p-1 chip"><X size={12} /></button>}</div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
        <div className="truncate rounded-lg px-2 py-1.5 chip" data-testid="path-from">{from?.name ?? "Start: select a node, then “Path from here”"}</div><ArrowRight size={13} className="text-white/40" />
        <div className="truncate rounded-lg px-2 py-1.5 chip" data-testid="path-to">{to?.name ?? "End: select a node, then “Path to here”"}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={onFind} disabled={!from || !to} className="rounded-lg bg-faze-red px-3 py-1.5 text-xs font-medium disabled:opacity-40">Find connection</button>
        <button onClick={onNearestAudience} disabled={!from || !canSearch} className="rounded-lg px-2.5 py-1.5 text-xs chip disabled:opacity-40">Nearest audience</button>
        <button onClick={onNearestRevenue} disabled={!from || !canSearch} className="rounded-lg px-2.5 py-1.5 text-xs chip disabled:opacity-40">Nearest revenue</button>
      </div>
      {searched && !result && <p className="mt-3 text-xs text-amber-200" role="status">No meaningful path at this date and with these filters. Turn on more layers or move the date.</p>}
      {result && (
        <ol className="mt-3 space-y-1" data-testid="path-result" aria-label="Path">
          {result.nodeIds.map((id, i) => {
            const n = nodes.get(id); const hop = result.links[i];
            if (!n) return null; // node left the view (mode, layer or date changed)
            return (
              <li key={id}>
                <button onClick={() => onSelect(id)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/6 px-2.5 py-1.5 text-left text-xs hover:bg-white/10">
                  <span className="truncate">{n.name}</span><span className="shrink-0 text-[10px] uppercase text-white/40">{CATEGORY_LABEL[n.category]}</span>
                </button>
                {hop && <div className="ml-4 flex items-center gap-2 py-0.5 text-[11px] text-white/50"><span className="h-3 border-l border-dashed border-white/25" />{hop.link.type.replaceAll("_", " ").toLowerCase()}<StatusBadge status={hop.link.status} /></div>}
              </li>
            );
          })}
        </ol>
      )}
      {result && (result.containsInferred || result.containsSimulated) && (
        <p className="mt-2 rounded-lg bg-violet-400/10 p-2 text-[11px] text-violet-100">
          {result.containsSimulated ? "This path uses simulated links. " : ""}{result.containsInferred ? "This path includes inferred or mock links (dashed). Audience and narrative hops are analyst-inferred, not measured." : ""}
        </p>
      )}
    </section>
  );
}
