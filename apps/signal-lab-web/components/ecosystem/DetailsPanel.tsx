"use client";
import { useMemo } from "react";
import { AlertTriangle, ExternalLink, GitBranch, X } from "lucide-react";
import type { GraphNode, NodeHistory, Source } from "@/lib/graph/types";
import { CATEGORY_LABEL, type GraphView, type ViewNode } from "@/lib/graph/view";
import type { NodeStats } from "@/lib/graph/stats";
import { fmtDate, isValidAt } from "@/lib/graph/temporal";
import { OriginBadge, StatusBadge, compact, pct } from "./badges";

interface Props {
  node: ViewNode;
  history: NodeHistory | null;
  loading: boolean;
  view: GraphView;
  stats: NodeStats | null;
  sources: Map<string, Source>;
  asOfIso: string;
  depth: 1 | 2;
  onDepth: (d: 1 | 2) => void;
  onSelect: (id: string) => void;
  onPathStart: () => void;
  onPathEnd: () => void;
  onClose: () => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-4"><h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/40">{title}</h3>{children}</section>
);

export function DetailsPanel({ node, history, loading, view, stats, sources, asOfIso, depth, onDepth, onSelect, onPathStart, onPathEnd, onClose }: Props) {
  const byId = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view]);
  const roles = useMemo(() => {
    if (!history || (node.category !== "person" && node.category !== "organization" && node.category !== "team")) return [];
    const nodes = new Map<string, GraphNode>([...history.related, history.node].map((n) => [n.id, n]));
    const out: { key: string; who: GraphNode; role: GraphNode; at: GraphNode | undefined; from: string | null; to: string | null; prec?: "day" | "month" | "year"; status: GraphNode["temporal"]["status"]; src: string; note?: string }[] = [];
    for (const r of history.relationships.filter((x) => x.type === "HAS_ASSIGNMENT")) {
      const role = nodes.get(r.to), who = nodes.get(r.from);
      const atRel = history.relationships.find((x) => x.type === "AT" && x.from === r.to);
      if (!role || !who) continue;
      out.push({ key: r.id, who, role, at: atRel ? nodes.get(atRel.to) : undefined, from: r.temporal.validFrom, to: r.temporal.validTo, prec: r.temporal.datePrecision, status: r.temporal.status, src: r.temporal.sourceId, note: r.temporal.note });
    }
    return out.sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""));
  }, [history, node.category]);
  const stakes = useMemo(() => (history?.relationships ?? []).filter((r) => r.type === "HOLDS_STAKE_IN" || (r.type === "OF" && r.to === node.id)), [history, node.id]);
  const neighbours = useMemo(() => {
    const ids = new Set<string>();
    view.links.forEach((l) => { if (l.source === node.id) ids.add(l.target as string); if (l.target === node.id) ids.add(l.source as string); });
    const groups: Record<string, ViewNode[]> = {};
    ids.forEach((id) => { const n = byId.get(id); if (n && n.category !== "source" && n.category !== "claim") (groups[n.category] ??= []).push(n); });
    return groups;
  }, [view, node.id, byId]);
  const relSources = useMemo(() => {
    const ids = new Map<string, number>([[node.temporal.sourceId, 1]]);
    history?.relationships.forEach((r) => ids.set(r.temporal.sourceId, (ids.get(r.temporal.sourceId) ?? 0) + 1));
    return [...ids].map(([id, n]) => ({ id, n, src: sources.get(id) }));
  }, [history, node, sources]);
  const confs = history?.relationships.map((r) => r.temporal.confidence) ?? [];
  const minConf = confs.length ? Math.min(...confs) : node.temporal.confidence;
  const GROUPS: [string, string][] = [["team", "Teams"], ["person", "Creators and players"], ["content_asset", "Content"], ["campaign", "Campaigns"], ["organization", "Organizations"], ["brand", "Sponsors"], ["event", "Events"], ["audience_cohort", "Audience cohorts"], ["narrative", "Narratives"], ["product", "Products"], ["metric", "Measurements"]];

  return (
    <aside className="flex max-h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl glass" aria-label="Node details">
      <div className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-white/40">{CATEGORY_LABEL[node.category]}{node.subtype && node.subtype !== CATEGORY_LABEL[node.category] && node.subtype !== "Person" ? ` · ${node.subtype}` : ""}</div>
          <h2 className="mt-0.5 text-lg font-semibold leading-tight" data-testid="detail-name">{node.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><OriginBadge origin={node.origin} /><StatusBadge status={node.temporal.status} /><span className="text-[11px] text-white/50">confidence {pct(node.temporal.confidence)}</span>{node.demo && <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">Demo event</span>}</div>
        </div>
        <button onClick={onClose} aria-label="Close details" className="rounded-lg p-1.5 chip"><X size={14} /></button>
      </div>
      <div className="scroll-thin overflow-y-auto p-4 pt-0 text-sm">
        {node.origin === "simulated" && <p className="mt-3 flex gap-2 rounded-lg bg-amber-400/10 p-2.5 text-xs text-amber-100"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Simulation output from MiroFish (mock values). It is a prediction, not a fact, and is not stored in the observed graph.</p>}
        {node.temporal.status === "mock" && <p className="mt-3 rounded-lg bg-amber-400/10 p-2.5 text-xs text-amber-100">Invented demo value. Not a historical fact.</p>}
        {node.summary && <p className="mt-3 text-white/70">{node.summary}</p>}
        {node.disambiguation && <p className="mt-3 flex gap-2 rounded-lg bg-sky-400/10 p-2.5 text-xs text-sky-100"><GitBranch size={14} className="mt-0.5 shrink-0" />{node.disambiguation}</p>}
        {node.aliases.length > 0 && <Section title="Aliases"><div className="flex flex-wrap gap-1.5">{node.aliases.map((a) => <span key={a} className="rounded-md px-2 py-0.5 text-xs chip">{a}</span>)}</div></Section>}
        <Section title="Active dates">
          {node.temporal.validFrom === null && node.category === "person" ? (
            roles.length > 0
              ? <p className="tabular-nums">{fmtDate(roles.reduce((m, r) => (r.from && (!m || r.from < m) ? r.from : m), null as string | null))} → {roles.some((r) => r.to === null) ? "present" : fmtDate(roles.reduce((m, r) => (r.to && (!m || r.to > m) ? r.to : m), null as string | null))} <span className="text-xs text-white/45">(from roles)</span></p>
              : <p className="text-white/55">No role dates recorded.</p>
          ) : (
            <p className="tabular-nums">{fmtDate(node.temporal.validFrom, node.temporal.datePrecision)} → {node.temporal.validTo ? fmtDate(node.temporal.validTo, node.temporal.datePrecision) : "present"}</p>
          )}
          {node.temporal.note && <p className="mt-1 text-xs text-white/50">{node.temporal.note}</p>}
        </Section>

        {loading && <p className="mt-4 text-xs text-white/40">Loading history…</p>}
        {roles.length > 0 && (
          <Section title={node.category === "person" ? "Roles, current and historical" : "People and roles here"}>
            <ul className="space-y-1.5">
              {roles.map((r) => {
                const cur = isValidAt({ validFrom: r.from, validTo: r.to }, asOfIso);
                return (
                  <li key={r.key} className={`rounded-lg p-2 text-xs ${cur ? "bg-white/8" : "bg-white/3 text-white/55"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{node.category === "person" ? r.role.name : `${r.who.name}: ${r.role.name.split(" @ ")[0]}`}</span>
                      <span className="flex items-center gap-1.5">{cur && <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-300">at this date</span>}<StatusBadge status={r.status} /></span>
                    </div>
                    <div className="mt-0.5 tabular-nums text-white/50">{fmtDate(r.from, r.prec)} → {r.to ? fmtDate(r.to, r.prec) : "open"}</div>
                    {r.note && <div className="mt-0.5 text-white/45">{r.note}</div>}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        {stakes.length > 0 && (
          <Section title="Ownership">
            <ul className="space-y-1 text-xs">{[...new Set(stakes.map((s) => s.type === "HOLDS_STAKE_IN" ? s.to : s.from))].map((id) => { const st = history?.related.find((n) => n.id === id) ?? (history?.node.id === id ? history.node : undefined); return st ? <li key={id} className="rounded-lg bg-white/5 p-2">{st.name}<span className="block text-white/45">{fmtDate(st.temporal.validFrom, st.temporal.datePrecision)} → {st.temporal.validTo ? fmtDate(st.temporal.validTo, st.temporal.datePrecision) : "open"}{st.temporal.note ? ` · ${st.temporal.note}` : ""}</span></li> : null; })}</ul>
          </Section>
        )}
        {GROUPS.some(([c]) => neighbours[c]?.length) && (
          <Section title="Connected at this date">
            {GROUPS.filter(([c]) => neighbours[c]?.length).map(([c, label]) => (
              <div key={c} className="mb-2"><div className="text-[11px] text-white/40">{label}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{neighbours[c].slice(0, 14).map((n) => <button key={n.id} onClick={() => onSelect(n.id)} className="rounded-md px-2 py-0.5 text-xs chip hover:text-white">{n.name.length > 30 ? `${n.name.slice(0, 29)}…` : n.name}</button>)}{neighbours[c].length > 14 && <span className="text-xs text-white/40">+{neighbours[c].length - 14}</span>}</div></div>
            ))}
          </Section>
        )}
        {history && history.metrics.length > 0 && (
          <Section title="Metrics">
            <ul className="space-y-1.5">{history.metrics.map((m) => (
              <li key={m.id} className="rounded-lg bg-white/5 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span>{m.label}</span><StatusBadge status={m.status} /></div>
                <div className="mt-0.5 text-white/70"><b className="text-white">{m.unit.startsWith("USD") ? `$${compact(m.value)}` : m.unit === "ratio" || m.unit === "probability" ? pct(m.value) : compact(m.value)}</b> {m.unit.startsWith("USD") ? m.unit.replace("USD", "").trim() : m.unit} · {fmtDate(m.observedAt)}</div>
                {m.note && <div className="mt-0.5 text-white/45">{m.note}</div>}</li>))}</ul>
          </Section>
        )}
        {stats && (
          <Section title="Network position">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/5 p-2"><dt className="text-white/45">Connections</dt><dd className="text-lg font-semibold">{stats.degree}</dd></div>
              <div className="rounded-lg bg-white/5 p-2"><dt className="text-white/45">Bridge score</dt><dd className="text-lg font-semibold">{pct(stats.betweenness)} <span className="text-xs font-normal text-white/45">{stats.bridgeLabel}</span></dd></div>
              <div className="rounded-lg bg-white/5 p-2"><dt className="text-white/45">Audience cohorts within 3 hops</dt><dd className="font-semibold">{stats.cohorts.length}</dd>{stats.cohorts.slice(0, 3).map((c) => <dd key={c.id} className="text-white/50">{c.name} ({c.hops})</dd>)}</div>
              <div className="rounded-lg bg-white/5 p-2"><dt className="text-white/45">Revenue paths within 4 hops</dt><dd className="font-semibold">{stats.revenuePaths.length}</dd>{stats.revenuePaths.slice(0, 3).map((c) => <dd key={c.id} className="text-white/50">{c.name.length > 26 ? `${c.name.slice(0, 25)}…` : c.name} ({c.hops}){c.status === "mock" ? " mock" : ""}</dd>)}</div>
            </dl>
            <p className="mt-2 text-xs text-white/60" data-testid="dependency">Dependency risk: <b className={stats.dependency.label === "high" ? "text-red-300" : stats.dependency.label === "moderate" ? "text-amber-300" : "text-white"}>{stats.dependency.label}</b>
              {stats.dependency.label !== "n/a" && ` · removing this node disconnects ${stats.dependency.lost} of ${stats.dependency.total} cohort and revenue nodes from FaZe Clan`}{stats.dependency.lostNames.length > 0 && ` (${stats.dependency.lostNames.join(", ")})`}. Structural only, not a financial estimate.</p>
          </Section>
        )}
        <Section title={`Sources (${relSources.length}) · lowest link confidence ${pct(minConf)}`}>
          <ul className="space-y-1 text-xs">{relSources.map(({ id, n, src }) => (
            <li key={id} className="flex items-start justify-between gap-2 rounded-lg bg-white/5 p-2"><span><b className="font-medium">{src?.publisher ?? id}</b><span className="block text-white/45">{src?.title}</span></span>
              <span className="flex shrink-0 items-center gap-2 text-white/45">{n}×{src?.url && <a href={src.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${src.publisher}`} className="text-faze-red"><ExternalLink size={12} /></a>}</span></li>))}</ul>
        </Section>
      </div>
    </aside>
  );
}
