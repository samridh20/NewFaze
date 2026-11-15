import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield, Star } from "lucide-react";
import { activeRoster, championshipStars } from "@/lib/siteData";

export default function Roster() {
  return (
    <div className="roster-page">
      <section className="roster-hero">
        <div className="roster-hero-image" />
        <div className="page-shell roster-hero-copy">
          <p className="eyebrow">CURRENT COMPETITION / CHAMPIONSHIP DNA</p>
          <h1>THE<br /><em>ROSTER.</em></h1>
          <p>The names on the server change. The standard does not. Meet the active competitors carrying FaZe’s mark into the next match.</p>
        </div>
      </section>
      <div className="page-shell">
        <section className="roster-proof reveal">
          <div><p className="eyebrow red">WHY THE JERSEY HITS DIFFERENT</p><h2>FIVE MARKS.<br /><em>ONE STANDARD.</em></h2></div>
          <div className="roster-stars">{championshipStars.map((item, index)=><article key={item.year + item.game}><Star fill="currentColor"/><span>0{index + 1}</span><strong>{item.year}</strong><p>{item.game}</p></article>)}</div>
        </section>

        <section className="team-cards reveal">
          <div className="section-heading"><h2>ACTIVE COMPETITION</h2><a className="text-link" href="https://fazeclan.com/pages/people" target="_blank" rel="noreferrer">Verify on the official directory <ArrowUpRight /></a></div>
          <p className="roster-disclaimer">A focused view of the competitive names listed through FaZe’s official directory. The official page remains the source of truth as rosters move.</p>
          <div className="team-card-grid">
            {activeRoster.map((team, index)=><article key={team.group}>
              <div className="team-card-image"><img src={team.image} alt=""/><span>0{index + 1}</span><b>{team.accent}</b></div>
              <div className="team-card-copy"><div><Shield/><p className="eyebrow red">ACTIVE / OFFICIAL DIRECTORY</p></div><h3>{team.group}</h3><p>{team.names}</p><a href="https://fazeclan.com/pages/people" target="_blank" rel="noreferrer">See official profiles <ArrowUpRight/></a></div>
            </article>)}
          </div>
        </section>

        <section className="roster-arena reveal">
          <img src="/media/antwerp.jpg" alt="Illustrative FaZe championship arena artwork"/>
          <div><p className="eyebrow">THE RECEIPT / ANTWERP 2022</p><h2>THE LIGHTS<br />ARE THE <em>POINT.</em></h2><p>A roster page should show more than handles. It should show what all that practice is for: the stage, the pressure and the proof.</p><a className="button primary" href="https://liquipedia.net/counterstrike/FaZe_Clan" target="_blank" rel="noreferrer">Open championship history <ArrowUpRight/></a></div>
        </section>

        <section className="roster-cta">
          <p className="eyebrow">WANT YOUR WORK FEATURED NEXT?</p>
          <h2>YOUR NAME COULD<br />ENTER THE <em>STORY.</em></h2>
          <p>Recreate the moment, post your clip and earn a shot at the next community cut.</p>
          <Link className="button primary" href="/make-the-cut">Make the cut <ArrowRight /></Link>
        </section>
      </div>
    </div>
  );
}
