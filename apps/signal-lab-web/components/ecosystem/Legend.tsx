import { LAYERS } from "@/lib/graph/types";
import { LAYER_COLORS } from "@/lib/graph/view";

export function Legend() {
  return (
    <div className="rounded-xl px-3 py-2 text-[11px] text-white/65 glass" aria-label="Legend">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {LAYERS.map((l) => <span key={l.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[l.id] }} />{l.label}</span>)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#fff" strokeWidth="1.6" /></svg>verified / reported</span>
        <span className="flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#a78bfa" strokeWidth="1.6" strokeDasharray="4 3" /></svg>inferred or mock</span>
        <span className="flex items-center gap-1.5"><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#64748b" /><circle cx="7" cy="7" r="6" fill="none" stroke="#fbbf24" strokeDasharray="2 2" /></svg>simulated</span>
        <span>Node size shows influence; stronger lines show higher-confidence relationships.</span>
      </div>
    </div>
  );
}
