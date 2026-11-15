import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/SiteHeader";
export const metadata: Metadata = {
  title: {
    default: "nextFAZE — The history. The people. What comes next.",
    template: "%s · nextFAZE",
  },
  description:
    "The moments that made us. The next one is yours. Explore FaZe history, recreate an iconic shot, and help make the next cut.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10100e",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <a href="/">
            next<span>FAZE</span>
          </a>
          <p>Built by the community. Made for the next generation.</p>
          <span>EST. 2010 — STILL MAKING HISTORY.</span>
        </footer>
      </body>
    </html>
  );
}
