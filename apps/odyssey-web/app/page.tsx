"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Filmstrip } from "@/components/Filmstrip";
import { campaignHref, media, stateLabels } from "@/lib/content";
import { useLobby } from "@/lib/useLobby";
export default function Homecoming() {
  const { data, offline } = useLobby();
  const current = data?.this_week;
  const href = current ? `/make-the-cut/${current.slug}` : campaignHref;
  const published = current?.state === "published" && data?.last_final_cut;
  return (
    <div className="home-page">
      <section className="home-hero">
        <div
          className="hero-art"
          style={{ backgroundImage: `url(${media.hero.poster})` }}
        />
        <span className="art-label">NEXTFAZE / HOMECOMING / CONCEPT ART</span>
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> SEASON 01{" "}
            <span className="red">/</span> HOMECOMING
          </p>
          <h1>
            THE NEXT
            <br />
            MOMENT
            <br />
            IS <em>YOURS.</em>
          </h1>
          <p className="hero-deck">
            You watched the originals.
            <br />
            Now help make what comes next.
          </p>
          <div className="actions">
            <Link
              className="button primary"
              href={
                published ? `/final-cut/${data?.last_final_cut?.slug}` : href
              }
            >
              {published ? "Watch the final cut" : "Make the Cut"}
              <ArrowRight size={20} />
            </Link>
            <Link className="text-link" href="/archive">
              Where it all started <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="hero-bottom">
          <span>THE MOMENTS THAT MADE US.</span>
          <span>THE COMMUNITY THAT KEEPS IT GOING. ↓</span>
        </div>
      </section>
      <div className="motion-ticker" aria-hidden="true">
        <div>
          <span>WATCH THE ORIGINAL</span><i>✦</i>
          <span>RECREATE THE MOMENT</span><i>✦</i>
          <span>BACK YOUR FAVORITE</span><i>✦</i>
          <span>MAKE THE FINAL CUT</span><i>✦</i>
          <span>WATCH THE ORIGINAL</span><i>✦</i>
          <span>RECREATE THE MOMENT</span><i>✦</i>
          <span>BACK YOUR FAVORITE</span><i>✦</i>
          <span>MAKE THE FINAL CUT</span><i>✦</i>
        </div>
      </div>
      <div className="page-shell">
        <Filmstrip />
        <section className="home-editorial reveal" data-testid="this-week">
          <div>
            <p className="eyebrow red">MAKE THE CUT / CHAPTER 01</p>
            <h2>
              OLD SCHOOL.
              <br />
              NEW <em>LEGENDS.</em>
            </h2>
          </div>
          <div className="editorial-copy">
            <span className="status-tag">
              {current
                ? (stateLabels[current.state] ?? current.state)
                : "Featured campaign"}
            </span>
            <h3>{current?.title ?? "Recreate the Temperrr Shot"}</h3>
            <p>
              An iconic shot. A new generation of players. Watch the original,
              put your own spin on it, and help choose the community cut.
            </p>
            <Link href={href} className="text-link">
              Open the challenge <ArrowRight size={18} />
            </Link>
            {offline && (
              <p className="subtle-note">
                Preview mode · connect the campaign service for live voting.
              </p>
            )}
          </div>
        </section>
        <section className="home-cards reveal">
          <Link className="image-card" href="/archive">
            <img
              src={media.community.poster}
              alt="Concept artwork of the original gaming era"
            />
            <div>
              <p className="eyebrow">FROM THE ARCHIVE / 2011</p>
              <h3>
                BEFORE THE HYPE.
                <br />
                THERE WERE CLIPS.
              </h3>
              <span className="text-link">
                Revisit the beginning <ArrowUpRight size={18} />
              </span>
            </div>
          </Link>
          <div className="next-card" data-testid="last-final-cut">
            <p className="eyebrow red">
              {data?.last_final_cut
                ? "THE LATEST RELEASE"
                : "THE STORY CONTINUES"}
            </p>
            <h3>{data?.last_final_cut?.title ?? "MAKE THE\nNEXT CUT."}</h3>
            <p>
              {data?.last_final_cut
                ? "The community made its choice. See the final cut and meet the creator behind it."
                : "The closing clip. The creator credit. A chance to be part of what FaZe makes next."}
            </p>
            <Link
              className="button outline"
              href={
                data?.last_final_cut
                  ? `/final-cut/${data.last_final_cut.slug}`
                  : `${href}#submit`
              }
            >
              {data?.last_final_cut
                ? "Watch the final cut"
                : "Post your recreation"}
              <ArrowRight size={20} />
            </Link>
          </div>
        </section>
        <section className="home-universe reveal">
          <div className="home-universe-title"><p className="eyebrow red">EXPLORE NEXTFAZE</p><h2>THE HISTORY.<br />THE PEOPLE.<br /><em>WHAT’S NEXT.</em></h2></div>
          <div className="home-universe-links">
            <Link href="/archive"><span>01</span><div><p className="eyebrow">THE LIVING COLLECTION</p><h3>ARCHIVE</h3></div><ArrowUpRight /></Link>
            <Link href="/roster"><span>02</span><div><p className="eyebrow">CREATORS &amp; COMPETITORS</p><h3>ROSTER</h3></div><ArrowUpRight /></Link>
            <Link href="/drop"><span>03</span><div><p className="eyebrow">OFFICIAL MERCHANDISE</p><h3>THE DROP</h3></div><ArrowUpRight /></Link>
          </div>
        </section>
      </div>
    </div>
  );
}
