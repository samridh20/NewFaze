import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";

const display = Inter({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = { title: "Signal Lab · FaZe Odyssey", description: "Scrims, MiroFish and VOD Review" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="bg-stage min-h-screen font-display antialiased">
        <Nav />
        <main className="mx-auto max-w-[1400px] px-6 pb-16">{children}</main>
      </body>
    </html>
  );
}
