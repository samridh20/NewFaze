"use client";
export const ODY =
  process.env.NEXT_PUBLIC_NEXTFAZE_URL ??
  process.env.NEXT_PUBLIC_ODYSSEY_URL ??
  "http://localhost:8001";
export const AUTH = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:8003";

export const getToken = () =>
  typeof window === "undefined" ? null : sessionStorage.getItem("t");
export const getHandle = () =>
  typeof window === "undefined" ? null : sessionStorage.getItem("h");

export async function signIn(account = "fan-ava") {
  const r = await fetch(`${AUTH}/dev/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account }),
  });
  const d = await r.json();
  if (!r.ok || typeof d.access_token !== "string" || !d.access_token)
    throw new Error("Sign-in service unavailable");
  sessionStorage.setItem("t", d.access_token);
  sessionStorage.setItem("h", d.handle);
  window.dispatchEvent(new Event("faze-auth"));
  return d;
}
export function signOut() {
  sessionStorage.removeItem("t");
  sessionStorage.removeItem("h");
  window.dispatchEvent(new Event("faze-auth"));
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const t = getToken();
  const r = await fetch(ODY + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.method === "POST"
        ? { "Idempotency-Key": crypto.randomUUID() }
        : {}),
      ...(init.headers || {}),
    },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
