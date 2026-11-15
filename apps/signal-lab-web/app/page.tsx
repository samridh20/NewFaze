"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Send, Loader2, CircleDot, MessageSquare, Users, Clock3, AlertTriangle, CheckCircle2 } from "lucide-react";
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

const STEPS = [
  ["ontology", "Ontology"], ["graph", "Graph (Zep)"], ["prepare", "Personas"], ["running", "Simulation"], ["ready", "Chat"],
] as const;
const ORDER = ["idle", "queued", "ontology", "graph", "create", "prepare", "start", "running", "ready"];
const BUSY = new Set(["queued", "ontology", "graph", "create", "prepare", "start", "running"]);

export default function Page() {
  return <SignInGate><MiroFishDashboard /></SignInGate>;
}

function MiroFishDashboard() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("clip-vote");
  const [prompt, setPrompt] = useState("");
  const [agents, setAgents] = useState(6);
  const [rounds, setRounds] = useState(12);
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
      if (r.simulation_id && ["running", "ready", "start"].includes(r.stage)) setFeed(await lab<Feed>("/v1/mirofish/feed"));
    } catch (e: any) { setError(e.title ?? "Signal Lab API unreachable"); }
  }, [graph.nodes.length]);

  useEffect(() => { lab("/v1/mirofish/scenarios").then((d) => setScenarios(d.scenarios)).catch(() => {}); }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const busy = run ? BUSY.has(run.stage) : false;
  async function start() {
    setError(null);
    try { setRun(await lab("/v1/mirofish/runs", { method: "POST", body: JSON.stringify({ scenario, prompt, agents, rounds }) })); setGraph({ nodes: [], edges: [] }); setFeed({ posts: [], agents: [], lean: null }); graphKey.current = null; }
    catch (e: any) { setError(e.detail ?? e.title ?? "Could not start"); }
  }

  return (
    <div className="pt-8">
      <div className="mb-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[.25em] text-faze-red">Live audience simulation</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Ask the crowd <span className="text-faze-red">before</span> you drop</h1>
        <p className="mx-auto mt-3 max-w-2xl text-white/55">Describe a drop, a brief or a sponsor moment. MiroFish builds a knowledge graph, spins up simulated fans, lets them argue, and you can interview any of them.</p>
      </div>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 glass">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-faze-red to-rose-700 shadow-lg shadow-red-700/30"><Zap size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold">Agent Simulation</h2>
              <p className="text-sm text-white/50">Real MiroFish v0.1.2 · Zep graph memory · Gemini via LiteLLM (budget-capped key)</p>
            </div>
          </div>
          <StatusPill run={run} />
        </div>

        <div className="mb-1 text-xs text-white/45">Quick scenarios</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => setScenario(s.id)}
              className={`rounded-xl px-3 py-2 text-left text-xs transition chip disabled:opacity-50 ${scenario === s.id ? "!border-faze-red/70 !bg-faze-red/15" : ""}`}>
              <span className="block font-medium text-white/90">{s.label}</span>
              <span className="block text-[10px] text-white/45">{s.tag}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy}
            placeholder="Add a question for the crowd… e.g. 'Which clip would you share with friends, and why?'"
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm placeholder-white/35 outline-none focus:border-faze-red/60 focus:ring-2 focus:ring-faze-red/30" />
          <button onClick={start} disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-faze-red px-6 py-3 text-sm font-medium shadow-lg shadow-red-700/30 transition hover:brightness-110 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Running</> : <>Run simulation</>}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-6 text-xs text-white/55">
          <label className="flex items-center gap-2">Agents <input type="range" min={3} max={12} value={agents} disabled={busy} onChange={(e) => setAgents(+e.target.value)} className="accent-[#e4002b]" /> <span className="w-5 text-white">{agents}</span></label>
          <label className="flex items-center gap-2">Rounds
            <select value={rounds} disabled={busy} onChange={(e) => setRounds(+e.target.value)} className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white">
              {[6, 12, 18, 24].map((r) => <option key={r} value={r}>{r} rounds ({r} simulated hours)</option>)}
            </select>
          </label>
          <span className="text-white/35">A full run takes about 5–10 minutes and a few cents on the capped key.</span>
        </div>
        {error && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"><AlertTriangle size={14} /> {error}</div>}
        <Stepper run={run} />
      </motion.section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="h-[600px]"><GraphView nodes={graph.nodes} edges={graph.edges} onSelect={setSelected} selected={selected} /></div>
        <div className="flex h-[600px] flex-col gap-5">
          <LeanCard lean={feed.lean} run={run} />
          <FeedCard feed={feed} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <ChatCard agents={feed.agents} run={run} />
        <div className="flex flex-col gap-5">
          <AnimatePresence>{selected && <NodeCard node={selected} onClose={() => setSelected(null)} />}</AnimatePresence>
          <Console run={run} />
        </div>
      </div>
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
      <p className="mt-2 text-[11px] text-white/40">{total ? `${total} agent posts take a side. ` : "Waiting for agents to take sides. "}Counted from mentions in posts; it is a signal, not a forecast.</p>
    </div>
  );
}

function FeedCard({ feed }: { feed: Feed }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl glass">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/45"><MessageSquare size={13} /> Live community feed</span>
        <span className="text-[11px] text-white/40"><Users size={11} className="mr-1 inline" />{feed.agents.length} agents</span>
      </div>
      <div className="scroll-thin mt-3 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
        {feed.posts.length === 0 && <p className="pt-10 text-center text-sm text-white/35">Agent posts and replies stream in here.</p>}
        <AnimatePresence initial={false}>
          {feed.posts.map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className={`rounded-xl px-3 py-2 chip ${p.kind === "comment" ? "ml-5" : ""}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-white/85">{p.agent}</span>
                <span className="text-white/35">{p.kind === "comment" ? "reply" : "post"} · ♥ {p.likes}</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-white/75">{p.content}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChatCard({ agents, run }: { agents: Agent[]; run: Run | null }) {
  const [agentId, setAgentId] = useState(0);
  const [q, setQ] = useState("Which option do you favour, and why?");
  const [thread, setThread] = useState<{ who: string; text: string; live?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const agent = agents.find((a) => a.id === agentId);
  async function ask() {
    setBusy(true); setThread((t) => [...t, { who: "you", text: q }]);
    try { const r = await lab("/v1/mirofish/chat", { method: "POST", body: JSON.stringify({ prompt: q, agent_id: agentId }) }); setThread((t) => [...t, { who: agent?.name ?? `agent ${agentId}`, text: r.reply, live: true }]); }
    catch (e: any) { setThread((t) => [...t, { who: "system", text: e.detail ?? e.title ?? "Chat failed" }]); }
    setBusy(false);
  }
  return (
    <div className="rounded-2xl p-5 glass">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-white/45">Interview a simulated fan</span>
        <span className="text-[11px] text-white/40">Live replies from the running MiroFish agents</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {agents.map((a) => (
          <button key={a.id} onClick={() => setAgentId(a.id)} className={`rounded-xl px-3 py-1.5 text-xs chip ${a.id === agentId ? "!border-faze-red/70 !bg-faze-red/15" : ""}`}>{a.name}</button>
        ))}
        {agents.length === 0 && <span className="text-xs text-white/35">Agents appear once personas are generated.</span>}
      </div>
      {agent && <p className="mb-3 text-xs text-white/45">{agent.bio}</p>}
      <div className="scroll-thin mb-3 max-h-64 space-y-2 overflow-y-auto">
        {thread.map((m, i) => (
          <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.who === "you" ? "ml-auto max-w-[80%] bg-faze-red/20" : m.who === "system" ? "bg-red-500/10 text-red-300" : "max-w-[90%] chip"}`}>
            <div className="text-[10px] uppercase tracking-wide text-white/40">{m.who}{m.live ? " · live" : ""}</div>{m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && ask()} aria-label="Question"
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-faze-red/60" />
        <button onClick={ask} disabled={busy || !run?.simulation_id} className="flex items-center gap-2 rounded-xl bg-faze-red px-4 py-2 text-sm disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Ask
        </button>
      </div>
    </div>
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

function Console({ run }: { run: Run | null }) {
  return (
    <div className="flex-1 rounded-2xl border border-white/5 bg-black/80 p-4 font-mono text-[11px]">
      <div className="mb-2 flex justify-between text-white/40"><span>SYSTEM MONITOR</span><span><Clock3 size={11} className="mr-1 inline" />{run?.elapsed_s ?? 0}s · {run?.simulation_id ?? "no simulation"}</span></div>
      <div className="scroll-thin max-h-48 space-y-0.5 overflow-y-auto">
        {(run?.log ?? []).slice().reverse().map((l, i) => (
          <div key={i} className={l.stage === "failed" ? "text-red-400" : "text-white/70"}>
            <span className="text-white/30">{new Date(l.t * 1000).toLocaleTimeString()}</span> {l.message}
          </div>
        ))}
        {!run?.log?.length && <div className="text-white/40">{run?.message ?? "Connecting…"}</div>}
      </div>
    </div>
  );
}
