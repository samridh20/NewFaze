"use client";
import { useState } from "react";
import { Check, Play, Trophy } from "lucide-react";
import { communityEntries } from "@/lib/siteData";

export default function CommunityGallery() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="community-gallery reveal" id="community-vote">
      <header>
        <div><p className="eyebrow red">COMMUNITY CUT / MVP PROTOTYPE</p><h2>WATCH THE FIELD.<br /><em>BACK A FAVORITE.</em></h2></div>
        <div className="gallery-note"><Trophy/><p>Sample submissions demonstrate the voting experience. Connect the live campaign service to publish real entries.</p></div>
      </header>
      <div className="submission-wall">
        {communityEntries.map((entry, index) => {
          const voted = selected === entry.id;
          return <article className={voted ? "voted" : ""} key={entry.id}>
            <div className="submission-image"><img src={entry.image} alt=""/><span>0{index + 1}</span><i><Play fill="currentColor"/></i></div>
            <div className="submission-meta"><div><p>{entry.handle}</p><h3>{entry.title}</h3></div><button onClick={() => setSelected(entry.id)} aria-pressed={voted}>{voted ? <Check/> : <Trophy/>}<span>{entry.votes + (voted ? 1 : 0)}</span></button></div>
          </article>;
        })}
      </div>
      <div className="vote-status" aria-live="polite">{selected ? "VOTE LOCKED FOR THIS PREVIEW — PICK ANOTHER ENTRY TO CHANGE IT." : "ONE PREVIEW VOTE. CHOOSE THE MOMENT YOU WANT IN THE FINAL CUT."}</div>
    </section>
  );
}
