import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { SessionBadge } from "@/components/SessionBadge";

const display = Inter({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600", "700", "800", "900"] });
export const metadata: Metadata = { title: "FaZe Odyssey", description: "Weekly drops. You make the cut." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050506" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body className="bg-stage min-h-screen font-display antialiased">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-black/50 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-faze-red text-sm font-black italic">FZ</span>
              <span className="text-lg font-black uppercase italic tracking-tight">FaZe <span className="text-faze-red">Odyssey</span></span>
            </Link>
            <SessionBadge />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 pb-20">{children}</main>
      </body>
    </html>
  );
}
