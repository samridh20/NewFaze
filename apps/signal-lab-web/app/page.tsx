"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, CircleDot, MessageSquare, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SignInGate } from "@/components/SignInGate";
import { GraphView, GNode, GEdge, TYPE_COLORS } from "@/components/GraphView";
import { lab } from "@/lib/api";

type Scenario = { id: string; label: string; tag: string };
type Run = {
  id: string | null; stage: string; message: string; scenario: string | null; simulation_id: string | null; graph_id: string | null;
  log: { t: number; stage: string; message: string }[]; elapsed_s: number; mirofish?: string;
  run_status?: { runner_status?: string; total_rounds?: number; posts?: number; comments?: number } | null;
};
type Post = { kind: string; id: string; agent: string; agent_id: number; content: string; likes: number; at: string };
type Agent = { id: number; name: string; username?: string; bio: string; mbti?: string; country?: string };
type Feed = { posts: Post[]; agents: Agent[]; lean: { a: number; b: number; method: string } | null };

const CASE_COPY = {
  "recruitment-masked": {
    label: "FaZe5 vs. FaZe1",
    description: "A blinded historical recruitment decision. The engine does not receive the real outcome.",
    prompt: "Which challenge will attract more total entries, and what participation barriers drive the difference?",
  },
  "mafiathon-masked": {
    label: "Mafiathon 2 vs. 3",
    description: "A blinded historical livestream comparison. Only information available before each event is included.",
    prompt: "Which challenge will reach the higher peak active subscription count, and which event mechanics drive the difference?",
  },
} as const;

const STEPS = [
  ["ontology", "Ontology"], ["graph", "Graph (Zep)"], ["prepare", "Personas"], ["running", "Simulation"], ["ready", "Result"],
] as const;
const ORDER = ["idle", "queued", "ontology", "graph", "create", "prepare", "start", "running", "ready"];
const BUSY = new Set(["queued", "ontology", "graph", "create", "prepare", "start", "running"]);

export default function Page() {
  return <SignInGate><MiroFishDashboard /></SignInGate>;
}
function MiroFishDashboard() {
  const [mode, setMode] = useState<"backtest" | "forecast">("backtest");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState<keyof typeof CASE_COPY>("recruitment-masked");
  const [prompt, setPrompt] = useState("Which challenge will attract more total entries, and what participation barriers drive the difference?");
  const [agents] = useState(6);
  const [rounds] = useState(6);
  const [customBrief, setCustomBrief] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [graph, setGraph] = useState<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] });
  const [feed, setFeed] = useState<Feed>({ posts: [], agents: [], lean: null });
  const [selected, setSelected] = useState<GNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const graphKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await lab<Run>("/v1/mirofish/runs/current");
      setRun(r);
      if (r.graph_id && (r.graph_id !== graphKey.current || BUSY.has(r.stage))) {
        const g = await lab("/v1/mirofish/graph");
        if (g.nodes.length !== graph.nodes.length || r.graph_id !== graphKey.current) setGraph(g);
        graphKey.current = r.graph_id;
      }
      if (r.simulation_id && ["running", "ready", "start"].includes(r.stage)) {
        const nextFeed = await lab<Feed>("/v1/mirofish/feed");
        setFeed(nextFeed);
      }
    } catch (e: any) { setError(e.title ?? "Signal Lab API unreachable"); }
  }, [graph.nodes.length]);

  useEffect(() => { lab("/v1/mirofish/scenarios").then((d) => setScenarios(d.scenarios)).catch(() => {}); }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const busy = run ? BUSY.has(run.stage) : false;
  const showingActiveRun = mode === "forecast" ? run?.scenario === "custom" : run?.scenario === scenario;
  function chooseScenario(next: keyof typeof CASE_COPY) {
    if (busy) return;
    setScenario(next);
    setPrompt(CASE_COPY[next].prompt);
    setSelected(null);
  }
  async function start() {
    setError(null);
    if (mode === "forecast" && customBrief.trim().length < 200) {
      setError("Add a campaign brief of at least 200 characters so MiroFish has enough evidence to build personas.");
      return;
    }
    const body = mode === "forecast"
      ? { scenario: "custom", prompt, agents, rounds, pack_md: customBrief, requirement: "Forecast how the audiences and creators in this campaign brief will react, identify the strongest commercial and engagement outcomes, and explain the risks." }
      : { scenario, prompt, agents, rounds };
    try { setRun(await lab("/v1/mirofish/runs", { method: "POST", body: JSON.stringify(body) })); setGraph({ nodes: [], edges: [] }); setFeed({ posts: [], agents: [], lean: null }); graphKey.current = null; }
    catch (e: any) { setError(e.detail ?? e.title ?? "Could not start"); }
  }

  return (
    <div className="pt-8">
      <div className="mb-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[.25em] text-faze-red">FaZe Decision Lab</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Test the decision. <span className="text-faze-red">Prove</span> it against history.</h1>
        <p className="mx-auto mt-3 max-w-2xl text-white/55">Turn FaZe ecosystem data into an audience forecast, then compare the prediction with what actually happened.</p>
      </div>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 glass">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-faze-red to-rose-700 shadow-lg shadow-red-700/30"><Zap size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold">Agent Simulation</h2>
              <p className="text-sm text-white/50">Choose a scenario, ask a focused question, and run the audience simulation.</p>
            </div>
          </div>
          <StatusPill run={run} />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-1.5">
          <button type="button" onClick={() => { if (!busy) { setMode("backtest"); setPrompt(CASE_COPY[scenario].prompt); } }} disabled={busy}
            className={`rounded-lg px-3 py-2 text-sm transition ${mode === "backtest" ? "bg-faze-red text-white" : "text-white/50 hover:bg-white/5"}`}>Historical backtest</button>
          <button type="button" onClick={() => { if (!busy) { setMode("forecast"); setPrompt("What audience response, engagement lift, and revenue opportunity should we expect from this campaign?"); } }} disabled={busy}
            className={`rounded-lg px-3 py-2 text-sm transition ${mode === "forecast" ? "bg-faze-red text-white" : "text-white/50 hover:bg-white/5"}`}>New campaign forecast</button>
        </div>

        {mode === "backtest" ? <div className="mb-4 rounded-xl border border-faze-red/30 bg-faze-red/[.07] px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Choose a locked validation case</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(CASE_COPY) as (keyof typeof CASE_COPY)[]).map((id) => (
              <button key={id} type="button" onClick={() => chooseScenario(id)} disabled={busy}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${scenario === id ? "border-faze-red/70 bg-faze-red/20 text-white" : "border-white/10 bg-black/20 text-white/55 hover:border-white/25"}`}>
                {scenarios.find((item) => item.id === id)?.label ?? CASE_COPY[id].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/50">{CASE_COPY[scenario].description}</p>
        </div> : <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[.04] px-4 py-3">
          <label htmlFor="campaign-brief" className="text-[10px] uppercase tracking-widest text-white/45">Campaign brief · used to build the graph and personas</label>
          <textarea id="campaign-brief" value={customBrief} onChange={(e) => setCustomBrief(e.target.value)} disabled={busy}
            rows={6} placeholder="Paste the campaign concept, creators, platforms, audience, offer, timing, budget constraints, and alternatives being considered…"
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-relaxed placeholder-white/30 outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20" />
          <div className="mt-1 text-right text-[11px] text-white/35">{customBrief.trim().length} characters · 200 minimum</div>
        </div>}

        <label htmlFor="decision-question" className="mb-1 block text-[10px] uppercase tracking-widest text-white/40">Decision question</label>
        <div className="flex gap-3">
          <input id="decision-question" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy}
            placeholder="Add a question for the crowd… e.g. 'Which clip would you share with friends, and why?'"
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm placeholder-white/35 outline-none focus:border-faze-red/60 focus:ring-2 focus:ring-faze-red/30" />
          <button onClick={start} disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-faze-red px-6 py-3 text-sm font-medium shadow-lg shadow-red-700/30 transition hover:brightness-110 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Running live</> : <>Run live simulation</>}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
          <span>Live MiroFish · 6 agents · 6 rounds · approximately 2–5 minutes</span>
          <span className="text-emerald-300/70">No API spend until you click Run live simulation</span>
        </div>
        {error && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"><AlertTriangle size={14} /> {error}</div>}
        <Stepper run={run} />
        {run?.message && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${run.stage === "failed" ? "bg-red-500/10 text-red-300" : "bg-white/[.03] text-white/45"}`}>
          {run.stage === "failed" && <AlertTriangle size={13} className="mr-2 inline" />}{run.message}
        </div>}
      </motion.section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="h-[600px]"><GraphView nodes={showingActiveRun ? graph.nodes : []} edges={showingActiveRun ? graph.edges : []} onSelect={setSelected} selected={selected} /></div>
        <div className="flex h-[600px] flex-col gap-5">
          <LeanCard lean={showingActiveRun ? feed.lean : null} run={showingActiveRun ? run : null} />
          <FeedCard feed={showingActiveRun ? feed : { posts: [], agents: [], lean: null }} />
        </div>
      </div>

      {mode === "backtest" && showingActiveRun && run?.stage === "ready" && <HistoricalResult scenario={scenario} lean={feed.lean} />}
      {selected && <div className="mt-5"><AnimatePresence><NodeCard node={selected} onClose={() => setSelected(null)} /></AnimatePresence></div>}
    </div>
  );
}
function StatusPill({ run }: { run: Run | null }) {
  const online = run?.mirofish === "online";
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-lg px-2 py-1 text-xs text-white/60 chip">MiroFish-powered</span>
      <span className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs chip ${online ? "text-emerald-300" : "text-red-300"}`}>
        <span className="relative flex h-2 w-2"><span className={`absolute h-2 w-2 rounded-full ${online ? "bg-emerald-400 animate-pulseRing" : ""}`} /><span className={`relative h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} /></span>
        {online ? "Engine online" : "Engine offline"}
      </span>
    </div>
  );
}

function Stepper({ run }: { run: Run | null }) {
  const idx = ORDER.indexOf(run?.stage ?? "idle");
  const failed = run?.stage === "failed";
  return (
    <div className="mt-5 grid grid-cols-5 gap-2">
      {STEPS.map(([key, label]) => {
        const k = ORDER.indexOf(key);
        const done = idx > k || run?.stage === "ready";
        const active = !done && (idx === k || (key === "graph" && run?.stage === "create") || (key === "running" && run?.stage === "start"));
        return (
          <div key={key} className={`rounded-xl px-3 py-2 text-xs chip ${active ? "!border-faze-red/60" : ""}`}>
            <div className="flex items-center gap-2">
              {done ? <CheckCircle2 size={14} className="text-emerald-400" /> : active && !failed ? <Loader2 size={14} className="animate-spin text-faze-red" /> : <CircleDot size={14} className="text-white/30" />}
              <span className={done || active ? "text-white" : "text-white/45"}>{label}</span>
            </div>
            {key === "running" && run?.run_status && (
              <div className="mt-1 text-[10px] text-white/45">{run.run_status.total_rounds ?? "?"} rounds · {run.run_status.posts ?? 0} posts · {run.run_status.comments ?? 0} replies</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LeanCard({ lean, run }: { lean: Feed["lean"]; run: Run | null }) {
  const a = lean?.a ?? 0, b = lean?.b ?? 0, total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 50;
  return (
    <div className="rounded-2xl p-5 glass">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-white/45">Crowd lean</span>
        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">simulated · uncalibrated</span>
      </div>
      <div className="mt-4 flex items-end justify-between text-sm">
        <div><div className="text-3xl font-bold text-faze-red">{total ? pa : "–"}%</div><div className="text-white/50">Option A</div></div>
        <div className="text-right"><div className="text-3xl font-bold text-cyan-300">{total ? 100 - pa : "–"}%</div><div className="text-white/50">Option B</div></div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/5">
        <motion.div className="h-full bg-gradient-to-r from-faze-red to-rose-500" animate={{ width: `${pa}%` }} transition={{ type: "spring", stiffness: 80 }} />
      </div>
      <p className="mt-2 text-[11px] text-white/40">{total ? `${total} agent decisions · ${lean?.method ?? "simulation tally"}. ` : "Waiting for agents to take sides. "}This is a signal, not a calibrated forecast.</p>
    </div>
  );
}

function FeedCard({ feed }: { feed: Feed }) {
  const evidence = feed.posts.filter((post) => post.kind === "post").slice(0, 5);
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl glass">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/45"><MessageSquare size={13} /> Why the audience chose</span>
        <span className="text-[11px] text-white/40"><Users size={11} className="mr-1 inline" />{feed.agents.length} agents</span>
      </div>
      <div className="scroll-thin mt-3 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
        {evidence.length === 0 && <p className="pt-10 text-center text-sm text-white/35">Agent reasoning appears after the simulation.</p>}
        <AnimatePresence initial={false}>
          {evidence.map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-xl px-3 py-2 chip">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-white/85">{p.agent}</span>
                <span className="text-white/35">agent perspective</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-white/75">{p.content}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HistoricalResult({ scenario, lean }: { scenario: keyof typeof CASE_COPY; lean: Feed["lean"] }) {
  const total = (lean?.a ?? 0) + (lean?.b ?? 0);
  const optionA = total ? Math.round(((lean?.a ?? 0) / total) * 100) : null;
  const recruitment = scenario === "recruitment-masked";
  const predicted = (lean?.b ?? 0) > (lean?.a ?? 0) ? "Challenge 2" : "Challenge 1";
  const correct = recruitment ? predicted === "Challenge 1" : predicted === "Challenge 2";
  return (
    <section className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[.05] p-5" data-testid="live-validation">
      <div className="text-xs font-medium uppercase tracking-widest text-emerald-300">Historical validation</div>
      <h2 className="mt-1 text-xl font-semibold">The live MiroFish run {correct ? "chose the correct campaign" : "did not match the historical winner"}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/40">Live prediction</div><div className="mt-1 font-medium">{predicted}{optionA === null ? "" : ` · ${predicted === "Challenge 1" ? optionA : 100 - optionA}% lean`}</div></div>
        <div className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/40">{recruitment ? "Challenge 1 actual" : "Challenge 1 actual"}</div><div className="mt-1 font-medium">{recruitment ? "#FaZe5 · 211,000+ applications" : "Mafiathon 2 · 728,525 peak active subs"}</div></div>
        <div className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/40">Challenge 2 actual</div><div className="mt-1 font-medium">{recruitment ? "FaZe1 · “Thousands” of submissions" : "Mafiathon 3 · 1,000,000+ peak active subs"}</div></div>
      </div>
      <p className="mt-3 text-sm text-white/55">{recruitment ? "Exact percentage error is not scorable because FaZe1 did not publish an exact submission count." : "Direction is scorable. The published Mafiathon 3 result is a lower bound, so this comparison evaluates the winning direction rather than exact percentage error."}</p>
    </section>
  );
}

function NodeCard({ node, onClose }: { node: GNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl p-5 glass">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: TYPE_COLORS[node.type] ?? "#94a3b8" }} />{node.name}</span>
        <button onClick={onClose} className="text-xs text-white/40 hover:text-white">close</button>
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-white/40">{node.type}</div>
      <p className="mt-2 text-sm text-white/70">{node.summary || "No summary yet."}</p>
    </motion.div>
  );
}
