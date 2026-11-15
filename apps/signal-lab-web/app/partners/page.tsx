"use client";
import { useEffect, useState } from "react";
import { SignInGate } from "@/components/SignInGate";
import { lab } from "@/lib/api";

export default function Page() { return <SignInGate><Partners /></SignInGate>; }

function Partners() {
  const [reports, setReports] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const l = await lab("/v1/partners");
    setReports(await Promise.all(l.partners.map((p: any) => lab(`/v1/partners/${p.id}/report`))));
  })().catch(() => {}); }, []);
  return (
    <div className="pt-8">
      <h1 className="text-3xl font-bold">Partners</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {reports.map((r) => (
          <div key={r.partner.id} data-testid="partner" className="rounded-2xl p-5 glass">
            <h3 className="text-lg font-semibold">{r.partner.name}</h3>
            <ul className="mt-3 space-y-1 text-sm text-white/70">{r.activations.map((a: any, i: number) => <li key={i}>{a.name} at {a.placement}</li>)}</ul>
            <p className="mt-3 text-xs text-amber-300/80">{r.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
