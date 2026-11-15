"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Play, Search, Star } from "lucide-react";
import { archiveEras, championshipStars } from "@/lib/siteData";
import { campaignHref } from "@/lib/content";

const filters = ["ALL", "ORIGINS", "CONTENT", "CULTURE", "EXPANSION", "CHAMPIONSHIPS", "REBUILD"];

export default function Archive() {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => archiveEras.filter((era) => {
    const haystack = `${era.years} ${era.type} ${era.title} ${era.summary} ${era.events.map((event) => `${event.date} ${event.title} ${event.body}`).join(" ")}`.toLowerCase();
    return (filter === "ALL" || era.type === filter) && haystack.includes(query.toLowerCase());
  }), [filter, query]);

  return (
    <div className="archive-page archive-expanded">
      <section className="archive-cover">
        <div className="archive-cover-art" />
        <div className="page-shell archive-cover-copy">
          <p className="eyebrow">NEXTFAZE / LIVING COLLECTION / 2010—2026</p>
          <h1>THE<br /><em>ARCHIVE.</em></h1>
          <div><p>Six eras. The original uploads, culture shifts and championship runs—organized as a story you can actually follow.</p><span className="eyebrow">SCROLL TO ENTER ↓</span></div>
        </div>
      </section>
      <div className="archive-marquee" aria-hidden="true"><div>2010 / ILLCAMS — 2012 / ONE MILLION — 2016 / THE SUPERTEAM — 2021 / CDL — 2022 / ANTWERP — 2023 / HALO — 2025 / SIX — </div></div>
      <div className="page-shell">
        <section className="archive-index">
          <div><p className="eyebrow red">THE OFFICIAL TIMELINE / REBUILT FOR FANS</p><h2>EVERY ERA.<br />ONE <em>STORY.</em></h2></div>
          <label className="archive-search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="SEARCH PEOPLE, GAMES OR MOMENTS" /></label>
          <div className="archive-filters">{filters.map((name)=><button className={filter===name?"selected":""} onClick={()=>setFilter(name)} key={name}>{name}</button>)}</div>
        </section>

        <section className="archive-timeline" aria-label="FaZe history timeline">
          {shown.map((era, eraIndex) => (
            <article className="archive-era reveal" key={era.years}>
              <div className="archive-era-rail"><span>{String(eraIndex + 1).padStart(2,"0")}</span><i /></div>
              <div className="archive-era-intro">
                <div className="archive-era-image"><img src={era.image} alt="" /><strong>{era.years}</strong></div>
                <p className="eyebrow red">{era.type}</p>
                <h3>{era.title}</h3>
                <p>{era.summary}</p>
              </div>
              <div className="archive-events">
                {era.events.map((event) => (
                  <a href={event.href} target="_blank" rel="noreferrer" key={event.date + event.title}>
                    <time>{event.date}</time>
                    <div><h4>{event.title}</h4><p>{event.body}</p><span>{event.label} <ArrowUpRight size={14}/></span></div>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
        {!shown.length && <div className="archive-empty"><h2>NO FRAME FOUND.</h2><button className="text-link" onClick={()=>{setFilter("ALL");setQuery("")}}>Reset the archive</button></div>}

        <section className="star-ledger reveal">
          <div className="star-ledger-copy"><p className="eyebrow red">THE FIVE-STAR LEDGER</p><h2>THE MARKS<br />HAVE <em>MEANING.</em></h2><p>The supplied history maps the five jersey stars to these world-level titles. This is a timeline reconstruction—not an official published logo key.</p></div>
          <div className="star-ledger-list">{championshipStars.map((item, index)=><article key={item.year + item.game}><span><Star fill="currentColor"/> 0{index+1}</span><strong>{item.year}</strong><div><h3>{item.game}</h3><p>{item.title}</p></div></article>)}</div>
        </section>

        <section className="archive-video-wall reveal">
          <div><p className="eyebrow red">WATCH / THE ORIGINAL LANGUAGE</p><h2>BEFORE THE FEED,<br />THERE WERE <em>CLIPS.</em></h2><p>Start at the source: the official FaZe channel and the uploads that taught a generation how to watch gaming.</p></div>
          <a href="https://www.youtube.com/@FaZeClan" target="_blank" rel="noreferrer"><img src="/media/archive-community.jpg" alt="FaZe community montage artwork"/><span><Play fill="currentColor"/> WATCH OFFICIAL FAZE VIDEOS</span></a>
        </section>
        <section className="archive-invitation">
          <p className="eyebrow">HISTORY DOESN’T STOP HERE</p><h2>THE NEXT FRAME<br />IS STILL <em>OPEN.</em></h2><Link href={campaignHref} className="button dark">Put yourself in the story <ArrowRight /></Link>
        </section>
      </div>
    </div>
  );
}
