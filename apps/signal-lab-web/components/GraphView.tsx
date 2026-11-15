"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Tag } from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type GNode = { id: string; name: string; type: string; summary: string };
export type GEdge = { source: string; target: string; label: string; fact: string };

export const TYPE_COLORS: Record<string, string> = {
  ReturningFan: "#ff3b5c", NewFan: "#22d3ee", LapsedFan: "#f59e0b", CommunityModerator: "#a78bfa",
  ContentCreator: "#34d399", FanGroup: "#f472b6", MediaPlatform: "#60a5fa", EventOrganizer: "#fb923c",
  Person: "#e5e7eb", Organization: "#94a3b8", Entity: "#64748b",
};
const color = (t: string) => TYPE_COLORS[t] ?? `hsl(${[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 70% 62%)`;

export function GraphView({ nodes, edges, onSelect, selected }: {
  nodes: GNode[]; edges: GEdge[]; onSelect: (n: GNode | null) => void; selected: GNode | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: 520 });
  const [labels, setLabels] = useState(false);
  useEffect(() => {
    const g = fg.current; if (!g) return;
    g.d3Force("charge")?.strength(-160);
    g.d3Force("link")?.distance(70);
  }, [nodes.length]);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const data = useMemo(() => {
    const groups: Record<string, number[]> = {};
    edges.forEach((e, i) => { const k = [e.source, e.target].sort().join("|"); (groups[k] ??= []).push(i); });
    const curv: number[] = [];
    Object.values(groups).forEach((idx) => idx.forEach((i, j) => { curv[i] = idx.length === 1 ? 0 : (j - (idx.length - 1) / 2) * 0.35; }));
    return { nodes: nodes.map((n) => ({ ...n })), links: edges.map((e, i) => ({ ...e, curvature: curv[i] })) };
  }, [nodes, edges]);
  const types = useMemo(() => [...new Set(nodes.map((n) => n.type))], [nodes]);
  const degree = useMemo(() => {
    const d: Record<string, number> = {};
    edges.forEach((e) => { d[e.source] = (d[e.source] ?? 0) + 1; d[e.target] = (d[e.target] ?? 0) + 1; });
    return d;
  }, [edges]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl glass" ref={wrap}>
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-white/45">Knowledge graph</span>
        <span className="rounded-md px-2 py-0.5 text-[11px] text-white/60 chip">{nodes.length} entities · {edges.length} relations</span>
      </div>
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button onClick={() => setLabels((v) => !v)} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs chip ${labels ? "text-white" : "text-white/50"}`}><Tag size={13} /> Edge labels</button>
        <button onClick={() => fg.current?.zoomToFit(500, 60)} className="rounded-lg px-2 py-1 text-xs chip"><Maximize2 size={13} /></button>
      </div>
      {nodes.length === 0 ? (
        <div className="grid h-full place-items-center text-sm text-white/40">The graph appears here once MiroFish builds it in Zep.</div>
      ) : (
        <ForceGraph2D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={120}
          onEngineStop={() => fg.current?.zoomToFit(400, 90)}
          d3VelocityDecay={0.3}
          onEngineTick={undefined}
          linkColor={() => "rgba(255,255,255,0.28)"}
          linkWidth={1.2}
          linkCurvature="curvature"
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleColor={() => "rgba(228,0,43,0.9)"}
          onNodeClick={(n: any) => onSelect(nodes.find((x) => x.id === n.id) ?? null)}
          onBackgroundClick={() => onSelect(null)}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(l: any, ctx: CanvasRenderingContext2D, scale: number) => {
            if (!labels || !l.label) return;
            const s = l.source, t = l.target; if (typeof s !== "object") return;
            ctx.font = `${8.5 / scale}px ui-monospace, monospace`;
            ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.textAlign = "center";
            ctx.fillText(l.label, (s.x + t.x) / 2, (s.y + t.y) / 2);
          }}
          nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const r = (5 + Math.min(5, (degree[n.id] ?? 0))) / Math.sqrt(scale);
            const c = color(n.type);
            const isSel = selected?.id === n.id;
            ctx.beginPath(); ctx.arc(n.x, n.y, r * (isSel ? 1.9 : 1.5), 0, 2 * Math.PI);
            ctx.fillStyle = isSel ? "rgba(255,255,255,0.18)" : c + "22"; ctx.fill();
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI); ctx.fillStyle = c; ctx.fill();
            {
              ctx.font = `${12 / scale}px Inter, system-ui, sans-serif`;
              ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "left";
              ctx.fillText(n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name, n.x + r + 4 / scale, n.y + 4 / scale);
            }
          }}
          nodePointerAreaPaint={(n: any, c: string, ctx: CanvasRenderingContext2D) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, 12, 0, 2 * Math.PI); ctx.fill(); }}
        />
      )}
      {types.length > 0 && (
        <div className="absolute bottom-4 left-4 z-10 flex max-w-[70%] flex-wrap gap-x-4 gap-y-1 rounded-xl px-3 py-2 glass">
          {types.map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-[11px] text-white/70"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color(t) }} />{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
