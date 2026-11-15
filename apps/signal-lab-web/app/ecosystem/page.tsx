"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Network } from "lucide-react";
import { MockGraphDataProvider } from "@/lib/graph/mockProvider";
import { DEMO_NOW, resolveAsOf } from "@/lib/graph/temporal";
import { LAYERS, type GraphDataProvider, type GraphSnapshot, type Layer, type NodeHistory, type SearchHit, type SimulationScenario, type ViewMode } from "@/lib/graph/types";
import { composeView, layerOf, neighborhood } from "@/lib/graph/view";
import { findNearest, findPath, isAudience, isRevenue, type PathResult } from "@/lib/graph/pathfinding";
import { betweenness, nodeStats } from "@/lib/graph/stats";
import { EcosystemGraph } from "@/components/ecosystem/EcosystemGraph";
import { SearchBox, TimeControls, monthCount } from "@/components/ecosystem/Controls";
import { DetailsPanel } from "@/components/ecosystem/DetailsPanel";
import { Legend } from "@/components/ecosystem/Legend";

// The ecosystem's value is the full cross-business network: talent, esports, content, commerce and audiences together.
const DEFAULT_LAYERS = new Set<Layer>(LAYERS.map((layer) => layer.id).filter((layer) => layer !== "evidence"));

export default function EcosystemPage() {
  // The UI talks to GraphDataProvider only. Swap this line for a Neo4j- or API-backed provider later.
  const provider = useMemo<GraphDataProvider>(() => new MockGraphDataProvider(), []);
  const [asOf, setAsOf] = useState<string | "current">("current");
  const [mode, setMode] = useState<ViewMode>("observed");
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(DEFAULT_LAYERS);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [history, setHistory] = useState<NodeHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [ambiguous, setAmbiguous] = useState(false);
  const [edgeLabels, setEdgeLabels] = useState(false);
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [pathTo, setPathTo] = useState<string | null>(null);
  const [path, setPath] = useState<PathResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [pulse, setPulse] = useState<ReadonlySet<string>>(new Set());
  const nowIso = (provider as unknown as { currentTime?: string }).currentTime ?? DEMO_NOW;

  // load snapshot (re-runs when the date changes or a live event arrives)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    provider.getSnapshot(asOf).then((s) => { if (alive) { setSnapshot(s); setError(null); setLoading(false); } })
      .catch((e) => { if (alive) { setError(String(e?.message ?? e)); setLoading(false); } });
    return () => { alive = false; };
  }, [provider, asOf, version]);
  // simulation results load separately and never touch the snapshot
  useEffect(() => {
    if (mode === "observed" || scenario) return;
    provider.listScenarios().then((l) => (l[0] ? provider.loadSimulation(l[0].scenarioId) : null)).then((s) => s && setScenario(s)).catch((e) => setError(String(e?.message ?? e)));
  }, [provider, mode, scenario]);
  useEffect(() => provider.subscribe((e) => { setPulse(new Set(e.touched.flatMap((t) => t.split(">")))); setVersion((v) => v + 1); }), [provider]);
  useEffect(() => { if (!pulse.size) return; const t = setTimeout(() => setPulse(new Set()), 3200); return () => clearTimeout(t); }, [pulse]);

  const view = useMemo(() => (snapshot ? composeView({ snapshot, scenario, mode, layers }) : null), [snapshot, scenario, mode, layers]);
  const byId = useMemo(() => new Map((view?.nodes ?? []).map((n) => [n.id, n])), [view]);
  const bc = useMemo(() => (view ? betweenness(view) : new Map<string, number>()), [view]);
  const sel = selected ? byId.get(selected) ?? null : null;
  const stats = useMemo(() => (view && sel ? nodeStats(view, sel.id, bc) : null), [view, sel, bc]);
  const sources = useMemo(() => new Map((snapshot?.sources ?? []).concat([{ id: "sim-mirofish-mock", title: "Mock MiroFish scenario output", publisher: "MiroFish (mock values)", kind: "demo" }]).map((s) => [s.id, s])), [snapshot]);
  const emphasis = useMemo(() => (view && sel ? neighborhood(view, sel.id, depth) : null), [view, sel, depth]);
  const pathNodes = useMemo(() => new Set(path?.nodeIds ?? []), [path]);
  const pathLinks = useMemo(() => new Set(path?.links.map((l) => l.link.id) ?? []), [path]);
  const layerCounts = useMemo(() => {
    const c = Object.fromEntries(LAYERS.map((l) => [l.id, 0])) as Record<Layer, number>;
    (snapshot?.nodes ?? []).forEach((n) => { c[layerOf(n)]++; });
    return c;
  }, [snapshot]);
  const names = useMemo(() => new Map((snapshot?.nodes ?? []).map((n) => [n.id, n.name])), [snapshot]);
  const asOfIso = resolveAsOf(asOf, nowIso);
  const lastIndex = monthCount(nowIso);

  useEffect(() => {  // details load per selection
    if (!selected) { setHistory(null); return; }
    let alive = true; setHistoryLoading(true);
    provider.getNodeHistory(selected).then((h) => { if (alive) { setHistory(h); setHistoryLoading(false); } });
    return () => { alive = false; };
  }, [provider, selected, version]);

  // search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setHits([]); setAmbiguous(false); return; }
    const [h, r] = await Promise.all([provider.search(q, 8), provider.resolveAlias(q)]);
    setHits(h); setAmbiguous(r.ambiguous);
  }, [provider]);
  const pick = useCallback((id: string) => {
    setSelected(id); setPath(null); setSearched(false);
    // a node outside the current date or layers would not be visible: say so by jumping to Current with its layer on
    provider.getNodeHistory(id).then((h) => {
      if (!h) return;
      const l = layerOf(h.node);
      setLayers((cur) => (cur.has(l) ? cur : new Set([...cur, l])));
      if (h.node.origin === "simulated") setMode((m) => (m === "observed" ? "compare" : m));
    });
  }, [provider]);

  // path
  const runPath = (kind: "pair" | "audience" | "revenue") => {
    if (!view || !pathFrom) return;
    setSearched(true);
    const r = kind === "pair" ? (pathTo ? findPath(view, pathFrom, pathTo) : null) : findNearest(view, pathFrom, kind === "audience" ? isAudience : isRevenue);
    setPath(r);
    if (r && kind !== "pair") setPathTo(r.nodeIds[r.nodeIds.length - 1]);
  };
  const clearPath = () => { setPath(null); setPathFrom(null); setPathTo(null); setSearched(false); };

  // a path computed for one mode, date or layer set is not valid for another
  useEffect(() => { setPath(null); setSearched(false); }, [mode, layers]);
  const toggleLayer = (l: Layer) => setLayers((cur) => { const n = new Set(cur); n.has(l) ? n.delete(l) : n.add(l); return n; });
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  return (
    <div className="pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[.25em] text-faze-red">FaZe Ecosystem Graph</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight"><Network size={26} className="text-faze-red" /> Who was connected to what, and when</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/55">Explore how creators, teams, content, sponsors, audiences and revenue connect—and how those relationships changed over time.</p>
        </div>
      </div>

      <div className="relative z-20 space-y-3 rounded-2xl p-4 glass">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SearchBox onSearch={search} hits={hits} onPick={pick} ambiguous={ambiguous} />
          <p className="max-w-md text-xs leading-relaxed text-white/45">Observed FaZe facts only. Select a creator, campaign or sponsor to inspect its history and supporting sources.</p>
        </div>
        <TimeControls asOf={asOf} nowIso={nowIso} onChange={(a) => { setAsOf(a); setPath(null); setSearched(false); }} lastIndex={lastIndex} />
      </div>

      {error && <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200"><AlertTriangle size={15} /> {error}
        <button onClick={() => { setError(null); setVersion((v) => v + 1); }} className="ml-auto rounded-lg px-2 py-1 text-xs chip">Retry</button></div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <div className="relative h-[640px]" data-testid="graph-region">
            {!view && !error && <div className="grid h-full place-items-center rounded-2xl glass text-white/50"><Loader2 className="mr-2 animate-spin" /> Loading graph…</div>}
            {view && <EcosystemGraph view={view} selectedId={selected} emphasis={emphasis} pathNodes={new Set()} pathLinks={new Set()} pulse={pulse} showEdgeLabels={false} onSelect={(id) => { setSelected(id); }} />}
            {loading && view && <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] glass"><Loader2 size={11} className="animate-spin" /> updating</span>}
            {view && <div className="absolute bottom-3 left-3 rounded-lg px-2.5 py-1 text-[11px] text-white/70 glass" data-testid="counts">{view.nodes.length} nodes · {view.links.length} relationships{view.simulationShown ? " · simulation shown" : ""}</div>}
          </div>
          <Legend />
        </div>

        <div className="space-y-3">
          {sel ? (
            <DetailsPanel node={sel} history={history} loading={historyLoading} view={view!} stats={stats} sources={sources} asOfIso={asOfIso} depth={depth} onDepth={setDepth}
              onSelect={pick} onPathStart={() => { setPathFrom(sel.id); setPath(null); setSearched(false); }} onPathEnd={() => { setPathTo(sel.id); setPath(null); setSearched(false); }} onClose={() => setSelected(null)} />
          ) : (
            <section className="rounded-2xl p-4 text-sm text-white/55 glass">
              <h2 className="font-semibold text-white">Explore the network</h2>
              <p className="mt-2 text-xs">Search for a creator, campaign or sponsor, then select a node to inspect its history, relationships and supporting sources.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
