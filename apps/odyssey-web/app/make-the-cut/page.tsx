"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Play, ScanLine, Send, Trophy } from "lucide-react";
import { campaignHref, media, stateLabels } from "@/lib/content";
import { useLobby } from "@/lib/useLobby";
import CommunityGallery from "@/components/CommunityGallery";

const process = [
  { n: "01", title: "WATCH", body: "Start with the original clip and the story behind it.", icon: Play },
  { n: "02", title: "REMIX", body: "Recreate the moment in your game, your setup and your style.", icon: ScanLine },
  { n: "03", title: "SUBMIT", body: "Post your clip and creator handle for community review.", icon: Send },
  { n: "04", title: "GET FEATURED", body: "The community pick earns permanent credit in the final release.", icon: Trophy },
];

export default function MakeTheCut() {
  const { data, offline } = useLobby();
  const current = data?.this_week;
  return (
    <div className="cut-page">
      <section className="cut-masthead">
        <div className="cut-masthead-art" style={{ backgroundImage: `url(${media.rooftop.poster})` }} />
        <div className="page-shell cut-masthead-copy">
          <p className="eyebrow"><span className="live-dot" /> CURRENT COMMUNITY BRIEF</p>
          <h1>MAKE<br />THE <em>CUT.</em></h1>
          <p>Watch the original. Recreate the moment. Put your name in the next community release.</p>
          <Link className="button primary" href={current ? `/make-the-cut/${current.slug}` : campaignHref}>
            Enter the challenge <ArrowRight size={19} />
          </Link>
        </div>
      </section>
      <div className="motion-ticker" aria-hidden="true"><div>
        <span>WATCH IT</span><i>✦</i><span>RECREATE IT</span><i>✦</i><span>POST IT</span><i>✦</i><span>MAKE THE CUT</span><i>✦</i>
        <span>WATCH IT</span><i>✦</i><span>RECREATE IT</span><i>✦</i><span>POST IT</span><i>✦</i><span>MAKE THE CUT</span><i>✦</i>
      </div></div>
      <div className="page-shell">
        <section className="cut-feature reveal">
          <div className="cut-feature-image">
            <img src={media.reference.poster} alt="The original Temperrr Shot" />
            <span className="cut-play"><Play fill="currentColor" /> 01 / ORIGINAL MOMENT</span>
          </div>
          <div className="cut-feature-copy">
            <p className="eyebrow red">NOW OPEN / RECREATE THE SHOT</p>
            <span className="status-tag">{current ? stateLabels[current.state] ?? current.state : "CAMPAIGN PREVIEW"}</span>
            <h2>THE TEMPERRR<br /><em>SHOT.</em></h2>
            <p>One rooftop. One impossible moment. Learn the move, bring your own style, and let the community decide what belongs in the final cut.</p>
            <Link className="button primary" href={current ? `/make-the-cut/${current.slug}` : campaignHref}>Open the full brief <ArrowRight /></Link>
            {offline && <small className="subtle-note">Preview mode · live submissions appear when campaign services connect.</small>}
          </div>
        </section>
        <section className="cut-process reveal">
          {process.map(({ n, title, body, icon: Icon }, index) => <article key={n}><div className="process-top"><span>{n}</span><Icon/></div><b>0{index + 1} / 04</b><h3>{title}</h3><p>{body}</p></article>)}
        </section>
        <section className="cut-rotation reveal">
          <div><p className="eyebrow red">NEXT IN THE ROTATION</p><h2>MORE WAYS<br />TO GET <em>IN.</em></h2></div>
          <div className="cut-rotation-grid">
            <article className="rotation-live"><img src="/media/antwerp.jpg" alt="Illustrative FaZe championship arena artwork"/><div className="rotation-label"><span>02 / CALL THE PLAY</span><b>NEW BRIEF</b></div><p>Study a championship round. Lock the call you would make before the pro reveal.</p><a href="#community-vote" className="text-link">Preview the fan vote <ArrowRight/></a></article>
            <article><img src={media.nightshift.poster} alt="Editing challenge artwork"/><span>03 / EDITOR RELAY</span><p>One creator supplies the play. Another makes the edit. Both earn the credit.</p><small>COMING NEXT</small></article>
          </div>
        </section>
        <CommunityGallery />
        <section className="cut-cta"><p className="eyebrow">YOUR HANDLE COULD BE HERE NEXT</p><h2>DON’T JUST WATCH<br />THE NEXT FAZE. <em>BE IN IT.</em></h2><Link href={campaignHref} className="button primary">Post your recreation <ArrowUpRight /></Link></section>
      </div>
    </div>
  );
}
