"use client";
import { useEffect, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { getHandle, signIn, signOut } from "@/lib/api";

export function SessionBadge() {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => { const u = () => setH(getHandle()); u(); window.addEventListener("faze-auth", u); return () => window.removeEventListener("faze-auth", u); }, []);
  return h ? (
    <button onClick={signOut} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm chip"><User size={14} /> {h} <LogOut size={13} className="text-white/40" /></button>
  ) : (
    <button id="signin" onClick={() => signIn("fan-ava")} className="flex items-center gap-2 rounded-full bg-faze-red px-4 py-1.5 text-sm font-semibold">
      <LogIn size={14} /> Sign in as demo fan (ava)
    </button>
  );
}
