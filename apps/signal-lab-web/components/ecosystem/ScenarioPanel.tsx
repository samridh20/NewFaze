"use client";
import { FlaskConical } from "lucide-react";
import type { SimulationScenario } from "@/lib/graph/types";
import type { BacktestForecast } from "@/lib/graph/types";
import { compact, money, pct } from "./badges";

function BacktestSummary({ b }: { b: BacktestForecast }) {
  const total = Object.values(b.tally).reduce((a, c) => a + c, 0) || 1;
  return (
    <div className="mt-3 rounded-lg bg-black/25 p-3 text-xs" data-testid="backtest-forecast">
      <div className="text-white/50">{b.question}</div>
      {b.options.map((o) => (
        <div key={o.label} className="mt-2"><div className="flex justify-between"><span>{o.label}</span><span className="text-amber-200">{b.tally[o.label] ?? 0} of {total} agents</span></div>
          <div className="mt-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-amber-300" style={{ width: `${((b.tally[o.label] ?? 0) / total) * 100}%` }} /></div></div>
      ))}
      <div className="mt-2 text-white/70">Predicted winner: <b className="text-amber-100">{b.predictedWinner ?? "tie"}</b>{b.undecided ? ` · ${b.undecided} undecided` : ""}</div>
      <div className="mt-1 text-[11px] text-white/45">{b.modelNote}</div>
    </div>
  );
}

export function ScenarioPanel({ scenario, names, onSelect, note }: { scenario: SimulationScenario; names: Map<string, string>; onSelect: (id: string) => void; note: string | null }) {
  const o = scenario.predictedOutcomes;
  const rows: [string, string][] = !o ? [] : [
    ["Qualified views", compact(o.qualifiedViews)], ["Engagement lift", `+${pct(o.engagementLift)}`], ["Purchase conversion", pct(o.purchaseConversion)],
    ["Expected revenue", money(o.expectedRevenue)], ["Backlash probability", pct(o.backlashProbability)],
  ];
  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4" aria-label="Simulation scenario" data-testid="scenario-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-100"><FlaskConical size={15} /> {scenario.title}</h2>
        <span className="rounded-md bg-amber-400/25 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-100">Simulated</span>
      </div>
      <p className="mt-1 text-[11px] text-amber-100/70">{scenario.engine} · from {scenario.graphSnapshotId}. Predictions only. Not stored as facts.</p>
      {note && <p className="mt-2 text-xs text-amber-200">{note}</p>}
      {scenario.backtest && <BacktestSummary b={scenario.backtest} />}
      {rows.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {rows.map(([k, v]) => <div key={k} className="rounded-lg bg-black/25 p-2"><dt className="text-white/50">{k}</dt><dd className="text-base font-semibold text-amber-100">{v}</dd></div>)}
      </dl>}
      {scenario.affectedCohorts.length > 0 && <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Affected cohorts (predicted lift)</h3>}
      <ul className="mt-1 space-y-1 text-xs">{scenario.affectedCohorts.map((c) => (
        <li key={c.cohortId}><button onClick={() => onSelect(c.cohortId)} className="flex w-full justify-between rounded-lg bg-black/20 px-2 py-1 text-left hover:bg-black/30"><span>{names.get(c.cohortId) ?? c.cohortId}</span><span className="text-amber-200">+{pct(c.liftEstimate)}</span></button></li>))}</ul>
      {scenario.recommendedCreators.length > 0 && <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Recommended creators</h3>}
      <ul className="mt-1 space-y-1 text-xs">{scenario.recommendedCreators.map((r) => (
        <li key={r.personId}><button onClick={() => onSelect(r.personId)} className="w-full rounded-lg bg-black/20 px-2 py-1 text-left hover:bg-black/30"><span className="flex justify-between"><b>{names.get(r.personId) ?? r.personId}</b><span className="text-amber-200">fit {pct(r.fit)}</span></span><span className="text-white/50">{r.reason}</span></button></li>))}</ul>
      <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Assumptions</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-white/55">{scenario.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
    </section>
  );
}
