"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, Waves, Network } from "lucide-react";

const LINKS = [
  { href: "/", label: "Decision Lab", icon: Waves },
  { href: "/ecosystem", label: "Ecosystem", icon: Network },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-faze-red shadow-lg shadow-red-600/30"><Radio size={18} /></div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Signal Lab</div>
            <div className="text-[11px] text-white/45">FaZe decision intelligence</div>
          </div>
        </div>
        <nav className="flex gap-1 rounded-xl p-1 chip">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}>
                <Icon size={15} /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
