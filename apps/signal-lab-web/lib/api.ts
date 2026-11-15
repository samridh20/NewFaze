"use client";
export const LAB = process.env.NEXT_PUBLIC_LAB_URL ?? "http://localhost:8002";
export const ODY = process.env.NEXT_PUBLIC_ODYSSEY_URL ?? "http://localhost:8001";
export const AUTH = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:8003";

export type Problem = { status: number; title?: string; detail?: string; type?: string };

export function getToken(): string | null {
  return typeof window === "undefined" ? null : sessionStorage.getItem("lt");
}

export async function signIn(account = "producer-pat"): Promise<string> {
  const r = await fetch(`${AUTH}/dev/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) });
  const t = (await r.json()).access_token as string;
  sessionStorage.setItem("lt", t);
  return t;
}

export async function lab<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const r = await fetch(LAB + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, ...body } as Problem;
  return body as T;
}

export async function ody<T = any>(path: string): Promise<T> {
  const r = await fetch(ODY + path);
  if (!r.ok) throw { status: r.status } as Problem;
  return r.json();
}
