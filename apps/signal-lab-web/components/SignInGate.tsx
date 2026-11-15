"use client";
import { useEffect, useState } from "react";
import { signIn } from "@/lib/api";

export function SignInGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    signIn("producer-pat").then(() => setOk(true)).catch(() => { setOk(false); setError("The local demo services are unavailable."); });
  }, []);
  if (ok === null) return <div className="mx-auto mt-24 max-w-md rounded-2xl p-8 text-center text-sm text-white/55 glass">Opening Decision Lab…</div>;
  if (ok) return <>{children}</>;
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl p-8 text-center glass">
      <h2 className="text-xl font-semibold">Could not open the demo</h2>
      <p className="mt-2 text-sm text-white/55">{error}</p>
      <button onClick={() => { setOk(null); setError(""); signIn("producer-pat").then(() => setOk(true)).catch(() => { setOk(false); setError("The local demo services are unavailable."); }); }} className="mt-6 rounded-xl bg-faze-red px-5 py-2.5 font-medium hover:brightness-110">Retry</button>
    </div>
  );
}
