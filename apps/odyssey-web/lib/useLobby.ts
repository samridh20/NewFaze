"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
export type CampaignSummary = { slug: string; title: string; state: string };
export type LobbyData = {
  this_week: CampaignSummary | null;
  last_final_cut: { slug: string; title: string } | null;
  next_drop: CampaignSummary | null;
};
export function useLobby() {
  const [data, setData] = useState<LobbyData | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    api<LobbyData>("/v1/lobby")
      .then((r) => {
        if (active) {
          if (r.status === 200) setData(r.body);
          else setOffline(true);
        }
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { data, offline };
}
