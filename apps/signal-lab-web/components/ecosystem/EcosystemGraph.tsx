"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { LAYER_COLORS, type GraphView } from "@/lib/graph/view";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface Props {
  view: GraphView;
  selectedId: string | null;
  emphasis: ReadonlySet<string> | null;       // nodes kept at full strength; everything else is dimmed, not removed
  pathNodes: ReadonlySet<string>;
  pathLinks: ReadonlySet<string>;
  pulse: ReadonlySet<string>;                 // ids touched by the latest live event
  showEdgeLabels: boolean;
  onSelect: (id: string | null) => void;
}

const EDGE_COLOR: Record<string, string> = { verified: "255,255,255", reported: "125,190,255", inferred: "167,139,250", mock: "251,191,36", disputed: "251,146,60", simulated: "251,191,36" };

export function EcosystemGraph({ view, selectedId, emphasis, pathNodes, pathLinks, pulse, showEdgeLabels, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const [size, setSize] = useState({ w: 800, h: 640 });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // Clone for the engine (it mutates). Reuse earlier positions so scrubbing the timeline does not scramble the layout.
  const data = useMemo(() => ({
    nodes: view.nodes.map((n) => { const p = positions.current.get(n.id); return p ? { ...n, x: p.x, y: p.y } : { ...n }; }),
    links: view.links.map((l) => ({ ...l })),
  }), [view]);
  useEffect(() => {
    const g = fg.current; if (!g) return;
    g.d3Force("charge")?.strength(-70);
    g.d3Force("link")?.distance(38);
  }, [data]);

  const dim = (id: string) => (emphasis && !emphasis.has(id) && !pathNodes.has(id) ? 0.1 : 1);
  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden rounded-2xl glass" role="img"
      aria-label={`Ecosystem graph with ${view.nodes.length} nodes and ${view.links.length} relationships.`}>
      <button onClick={() => fg.current?.zoomToFit(400, 60)} aria-label="Fit graph to screen" className="absolute right-3 top-3 z-10 rounded-lg p-2 chip"><Maximize2 size={14} /></button>
      {view.nodes.length === 0 ? (
        <div className="grid h-full place-items-center px-8 text-center text-sm text-white/45">
          {view.simulationNote ?? "Nothing is valid at this date with these filters. Turn on more layers or move the date."}
        </div>
      ) : (
        <ForceGraph2D
          ref={fg} width={size.w} height={size.h} graphData={data as any} backgroundColor="rgba(0,0,0,0)"
          warmupTicks={positions.current.size ? 0 : 60} cooldownTicks={90} d3AlphaDecay={0.04} d3VelocityDecay={0.35}
          onEngineStop={() => { if (!positions.current.size) fg.current?.zoomToFit(300, 60); }}
          onNodeClick={(n: any) => onSelect(n.id)} onBackgroundClick={() => onSelect(null)}
          nodeLabel={(n: any) => `${n.name} · ${n.category.replace("_", " ")}${n.origin === "simulated" ? " · SIMULATED" : ""}`}
          linkLabel={(l: any) => `${l.type.replaceAll("_", " ").toLowerCase()} · ${l.status} · ${Math.round(l.confidence * 100)}% confidence`}
          linkCurvature="curvature"
          linkLineDash={(l: any) => (l.dashed ? [4, 3] : null)}
          linkWidth={(l: any) => (pathLinks.has(l.id) ? 3.2 : 0.6 + l.confidence * 1.1)}
          linkColor={(l: any) => {
            const a = pathLinks.has(l.id) ? 1 : emphasis ? (emphasis.has((l.source as any).id ?? l.source) && emphasis.has((l.target as any).id ?? l.target) ? 0.75 : 0.05) : 0.32;
            return pathLinks.has(l.id) ? "rgba(228,0,43,1)" : l.origin === "simulated" ? `rgba(251,191,36,${a})` : `rgba(${EDGE_COLOR[l.status] ?? EDGE_COLOR.verified},${a})`;
          }}
          linkDirectionalParticles={(l: any) => (pathLinks.has(l.id) ? 3 : 0)} linkDirectionalParticleWidth={2.4} linkDirectionalParticleColor={() => "#ff3b5c"}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(l: any, ctx: CanvasRenderingContext2D, scale: number) => {
            if (!(showEdgeLabels || pathLinks.has(l.id)) || scale < 1.3) return;
            const s = l.source, t = l.target; if (typeof s !== "object" || typeof t !== "object") return;
            ctx.font = `${8 / scale}px ui-monospace, monospace`; ctx.fillStyle = pathLinks.has(l.id) ? "#fff" : "rgba(255,255,255,.45)"; ctx.textAlign = "center";
            ctx.fillText(l.type.replaceAll("_", " ").toLowerCase(), (s.x + t.x) / 2, (s.y + t.y) / 2);
          }}
          nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
            positions.current.set(n.id, { x: n.x, y: n.y });
            const r = Math.max(2.2, n.size * 0.55), a = dim(n.id), color = LAYER_COLORS[n.layer as keyof typeof LAYER_COLORS];
            const sel = n.id === selectedId, onPath = pathNodes.has(n.id), pulsing = pulse.has(n.id);
            ctx.globalAlpha = a;
            if (sel || onPath || pulsing) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI); ctx.fillStyle = pulsing ? "rgba(52,211,153,.35)" : onPath ? "rgba(228,0,43,.4)" : "rgba(255,255,255,.28)"; ctx.fill(); }
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = n.context ? `${color}88` : color; ctx.fill();
            if (n.origin === "simulated") { ctx.setLineDash([2, 2]); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(n.x, n.y, r + 1.8, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
            else if (n.demo) { ctx.setLineDash([1, 2]); ctx.strokeStyle = "#34d399"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.x, n.y, r + 1.8, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
            const important = (n.importance ?? 0) >= 0.7 || n.degree >= 14;
            if (sel || onPath || (emphasis?.has(n.id) && scale > 1.1) || (important && scale > 0.45) || scale > 2.4) {
              ctx.font = `${(sel ? 11 : 9) / Math.min(scale, 3)}px Inter, system-ui, sans-serif`;
              ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.textAlign = "left";
              const label = n.name.length > 28 ? `${n.name.slice(0, 27)}…` : n.name;
              ctx.fillText(label, n.x + r + 3, n.y + 3);
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n: any, c: string, ctx: CanvasRenderingContext2D) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(6, n.size * 0.7), 0, 2 * Math.PI); ctx.fill(); }}
        />
      )}
    </div>
  );
}
