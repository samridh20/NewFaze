"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Radio, Waves, Network } from "lucide-react";

const LINKS = [
  { href: "/", label: "Decision Lab", icon: Waves },
  { href: "/ecosystem", label: "Ecosystem", icon: Network },
];

export function Nav() {
  const path = usePathname();
  const fanUrl = process.env.NEXT_PUBLIC_FAN_APP_URL ?? "http://localhost:3001";
  return (
    <header className="signal-nav sticky top-0 z-30 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-5 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="signal-icon grid h-9 w-9 place-items-center bg-faze-red"><Radio size={18} /></div>
          <div>
            <div className="signal-wordmark text-[17px] font-black tracking-tight">next<span>FAZE</span> / SIGNAL LAB</div>
            <div className="text-[9px] uppercase tracking-[.2em] text-white/40">Decision intelligence system</div>
          </div>
        </div>
        <nav className="signal-links flex items-center gap-1 p-1 chip">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${active ? "bg-faze-red text-white" : "text-white/55 hover:text-white"}`}>
                <Icon size={15} /> {label}
              </Link>
            );
          })}
          <a href={fanUrl} className="fan-return flex items-center gap-2 border-l border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/55 transition hover:text-white">
            Fan experience <ArrowUpRight size={14}/>
          </a>
        </nav>
      </div>
    </header>
  );
}
