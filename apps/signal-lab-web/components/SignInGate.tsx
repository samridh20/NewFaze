"use client";
import { useEffect, useState } from "react";
import { getToken, signIn } from "@/lib/api";
import { LogIn } from "lucide-react";

export function SignInGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(!!getToken()), []);
  if (ok === null) return null;
  if (ok) return <>{children}</>;
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl p-8 text-center glass">
      <h2 className="text-xl font-semibold">Staff sign-in</h2>
      <p className="mt-2 text-sm text-white/55">Signal Lab is for producers and analysts. Demo mode uses a local sign-in.</p>
      <button onClick={async () => { await signIn("producer-pat"); setOk(true); }}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-faze-red px-5 py-2.5 font-medium hover:brightness-110">
        <LogIn size={16} /> Sign in as producer (pat)
      </button>
    </div>
  );
}
