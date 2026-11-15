"use client";
import { useEffect, useState } from "react";
import { Play, Lock, Square, Rocket, CheckCircle2, Loader2 } from "lucide-react";
import { SignInGate } from "@/components/SignInGate";
import { lab, ody } from "@/lib/api";

type Step = "run" | "commit" | "close" | "publish" | "done";

export default function Page() { return <SignInGate><Scrims /></SignInGate>; }

function Scrims() {
  const [c, setC] = useState<any>(null);
  const [step, setStep] = useState<Step>("run");
  const [run, setRun] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [commitment, setCommitment] = useState("");
  useEffect(() => { ody("/v1/campaigns/homecoming-week1").then(setC).catch(() => setMsg("Odyssey API unreachable")); }, []);
  const labels: Record<string, string> = {}; (c?.finalists ?? []).forEach((f: any) => (labels[f.entry_id] = f.label));
  async function act(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (e: any) { setMsg(`${e.title ?? "Failed"}${e.detail ? ": " + e.detail : ""}`); } setBusy(false); }

  const steps: { key: Step; label: string; icon: any; go: () => Promise<void> }[] = [
    { key: "run", label: "Run fixture scrim", icon: Play, go: async () => { const r = await lab("/v1/scrims", { method: "POST", body: JSON.stringify({ ballot_id: c.ballot.id, labels, bots: 20 }) }); setRun(r); setMsg(`Scrim done (fixture model, uncalibrated). A-B gap: ${r.paired_summary.a_minus_b}`); setStep("commit"); } },
    { key: "commit", label: "Register prediction (hash only)", icon: Lock, go: async () => { const r = await lab(`/v1/scrims/${run.id}/prediction`, { method: "POST" }); setCommitment(r.commitment); setMsg(`Prediction committed as hash ${r.commitment.slice(0, 12)}…`); setStep("close"); } },
    { key: "close", label: "Close ballot", icon: Square, go: async () => { await lab(`/v1/ballots/${c.ballot.id}/close`, { method: "POST" }); setMsg("Ballot closed"); setStep("publish"); } },
    { key: "publish", label: "Reveal and publish", icon: Rocket, go: async () => { const r = await lab(`/v1/scrims/${run.id}/reveal-and-publish`, { method: "POST" }); const slug = r.slug ?? r.episode?.slug; sessionStorage.setItem("slug", slug); setMsg(`Published. Final Cut: ${slug}`); setStep("done"); } },
  ];
  const order: Step[] = ["run", "commit", "close", "publish", "done"];

  return (
    <div className="pt-8">
      <h1 className="text-3xl font-bold">Scrim · Sim vs Fans</h1>
      <p className="mt-1 text-white/55">Predict the vote before it closes. Only a hash of the prediction reaches Odyssey until publish.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl p-5 glass">
          <div className="text-xs uppercase tracking-widest text-white/45">Drop</div>
          <div className="mt-1 text-lg font-semibold">{c?.title ?? "…"}</div>
          <div className="mt-1 text-sm text-white/55">Ballot: <span data-testid="ballot">{c?.ballot?.state ?? "…"}</span></div>
          <div className="mt-5 space-y-2">
            {steps.map((s, i) => {
              const done = order.indexOf(step) > i, active = step === s.key;
              return (
                <button key={s.key} disabled={!active || busy || !c} onClick={() => act(s.go)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition chip disabled:cursor-not-allowed ${active ? "!border-faze-red/70 !bg-faze-red/15" : ""} ${done ? "opacity-60" : ""}`}>
                  {done ? <CheckCircle2 size={16} className="text-emerald-400" /> : active && busy ? <Loader2 size={16} className="animate-spin" /> : <s.icon size={16} />}
                  {s.label}
                </button>
              );
            })}
          </div>
          <pre data-testid="log" role="status" className="mt-4 whitespace-pre-wrap rounded-xl bg-black/50 p-3 font-mono text-xs text-white/75">{msg}</pre>
        </div>
        <div className="rounded-2xl p-5 glass">
          <div className="text-xs uppercase tracking-widest text-white/45">Prediction</div>
          {run ? (
            <div className="mt-4 space-y-3">
              {Object.entries(run.paired_summary ? { A: 0.5 + run.paired_summary.a_minus_b / 2, B: 0.5 - run.paired_summary.a_minus_b / 2 } : {}).map(([k, v]: any) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span>Clip {k}</span><span>{Math.round(v * 100)}%</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/5"><div className={`h-2 rounded-full ${k === "A" ? "bg-faze-red" : "bg-cyan-400"}`} style={{ width: `${v * 100}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-white/40">{run.bots} bots × {run.seeds.length} seeds · fixture model · uncalibrated</p>
              {commitment && <p className="break-all font-mono text-[11px] text-white/50">commitment {commitment}</p>}
            </div>
          ) : <p className="mt-4 text-sm text-white/40">Run a scrim to see the predicted split.</p>}
        </div>
      </div>
    </div>
  );
}
