"use client";
import { useEffect, useState } from "react";
import { SignInGate } from "@/components/SignInGate";
import { lab } from "@/lib/api";

export default function Page() { return <SignInGate><Vod /></SignInGate>; }

function Vod() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { lab("/v1/vod/" + (sessionStorage.getItem("slug") || "homecoming-week1-final-cut")).then(setD).catch(() => setErr("No published Final Cut yet.")); }, []);
  const s = d?.sim_vs_fans, labels = d?.episode?.real?.labels ?? {};
  const total = s ? Object.values(s.real as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="pt-8">
      <h1 className="text-3xl font-bold">VOD Review</h1>
      {err && <p className="mt-4 text-white/55">{err}</p>}
      {d && (
        <div data-testid="vod" className="mt-6 rounded-2xl p-6 glass">
          <h2 className="text-xl font-semibold">{d.episode.title}</h2>
          <p className="mt-1 text-sm text-white/50">Markers: {d.markers.map((m: any) => m.label).join(", ")}</p>
          {s ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Object.keys(s.predicted).map((k) => (
                <div key={k} className="rounded-xl p-4 chip">
                  <div className="text-sm font-medium">Clip {labels[k] ?? k}</div>
                  <div className="mt-3 text-xs text-white/50">Simulated</div>
                  <div className="h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-amber-400" style={{ width: `${s.predicted[k] * 100}%` }} /></div>
                  <div className="mt-2 text-xs text-white/50">Real</div>
                  <div className="h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-faze-red" style={{ width: `${total ? (s.real[k] / total) * 100 : 0}%` }} /></div>
                  <div className="mt-2 text-xs text-white/60">{Math.round(s.predicted[k] * 100)}% simulated · {s.real[k]} real votes</div>
                </div>
              ))}
              <p data-testid="vod-sim" className="text-xs text-white/40 md:col-span-2">Simulated vs real (simulated, uncalibrated). Commitment {String(s.commitment ?? "").slice(0, 16)}…</p>
            </div>
          ) : <p className="mt-4 text-white/50">No prediction was registered.</p>}
        </div>
      )}
    </div>
  );
}
