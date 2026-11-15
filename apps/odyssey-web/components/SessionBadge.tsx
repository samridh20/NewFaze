"use client";
import { useEffect, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { getHandle, signIn, signOut } from "@/lib/api";
export function SessionBadge() {
  const [h, setH] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const u = () => setH(getHandle());
    u();
    window.addEventListener("faze-auth", u);
    return () => window.removeEventListener("faze-auth", u);
  }, []);
  return h ? (
    <button
      onClick={signOut}
      className="account-button"
      aria-label={`Sign out ${h}`}
    >
      <User size={14} /> {h} <LogOut size={13} />
    </button>
  ) : (
    <div className="account-wrap">
      <button
        id="signin"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await signIn("fan-ava");
          } catch {
            setError("Start the local auth service to sign in.");
          } finally {
            setBusy(false);
          }
        }}
        className="account-button"
        aria-label="Sign in as demo fan (ava)"
      >
        <LogIn size={14} /> {busy ? "Connecting…" : "Sign in"}
      </button>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
