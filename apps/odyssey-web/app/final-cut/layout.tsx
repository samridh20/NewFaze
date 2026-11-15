import type { Metadata } from "next";
export const metadata: Metadata = { title: "Final Cut" };
export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
