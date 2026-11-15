import type { Metadata } from "next";
export const metadata: Metadata = { title: "The Drop — Official Merchandise" };
export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
