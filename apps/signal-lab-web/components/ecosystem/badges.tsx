import type { Origin, Status } from "@/lib/graph/types";

const STYLE: Record<Status, string> = {
  verified: "bg-emerald-500/15 text-emerald-300", reported: "bg-sky-500/15 text-sky-300", inferred: "bg-violet-500/15 text-violet-300",
  disputed: "bg-orange-500/15 text-orange-300", mock: "bg-amber-500/15 text-amber-300", simulated: "bg-amber-500/20 text-amber-200",
};
const LABEL: Record<Status, string> = { verified: "Verified", reported: "Reported", inferred: "Inferred", disputed: "Disputed", mock: "MOCK", simulated: "SIMULATED" };

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLE[status]}`}>{LABEL[status]}</span>;
}
export function OriginBadge({ origin }: { origin: Origin }) {
  return origin === "simulated"
    ? <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">Simulation graph</span>
    : <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/60">Observed graph</span>;
}
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n);
export const money = (n: number) => `$${compact(n)}`;
