import type { Metadata } from "next";
export const metadata: Metadata = { title: "Make the Cut" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
