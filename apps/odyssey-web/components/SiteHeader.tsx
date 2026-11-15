"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SessionBadge } from "./SessionBadge";
export function SiteHeader() {
  const path = usePathname();
  const [expanded, setExpanded] = useState(false);
  const links = [
    { href: "/", label: "Home", active: path === "/" },
    { href: "/archive", label: "Archive", active: path.startsWith("/archive") },
    {
      href: "/make-the-cut",
      label: "Make the Cut",
      active: path.startsWith("/make-the-cut") || path.startsWith("/final-cut"),
    },
    { href: "/roster", label: "Roster", active: path.startsWith("/roster") },
    { href: "/drop", label: "The Drop", active: path === "/drop" },
  ];
  return (
    <header
      className={`site-header ${path.startsWith("/archive") ? "header-light" : ""}`}
    >
      <Link href="/" className="wordmark" aria-label="nextFAZE home">
        <img
          className="brand-mark"
          src="/brand/faze-wordmark-black.png"
          alt="FaZe"
        />
        <span className="brand-divider" />
        <span>
          next<em>FAZE</em><small>THE HISTORY. WHAT COMES NEXT.</small>
        </span>
      </Link>
      <button
        className="mobile-menu"
        aria-label={expanded ? "Close navigation" : "Open navigation"}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <X /> : <Menu />}
      </button>
      <nav aria-label="Main navigation" className={expanded ? "nav-open" : ""}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.active ? "page" : undefined}
            className={l.active ? "active" : ""}
            onClick={() => setExpanded(false)}
          >
            {l.label}
          </Link>
        ))}
        <SessionBadge />
      </nav>
    </header>
  );
}
